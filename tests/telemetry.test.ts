import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { runCouncil } from '../src/council.js';
import { runReview, runPlan, runDebate } from '../src/index.js';
import { flushTelemetry } from '../src/telemetry.js';
import type { CouncilConfig } from '../src/config.js';

interface Seen {
  path: string;
  headers: http.IncomingHttpHeaders;
  body: string;
}

function listen(handler: (req: http.IncomingMessage, body: string) => string, seen: Seen[]): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        seen.push({ path: req.url ?? '', headers: req.headers, body });
        if (req.url?.endsWith('/messages')) {
          res.setHeader('Content-Type', 'text/event-stream');
          const events = [
            { type: 'message_start', message: { id: 'x', type: 'message', role: 'assistant', model: 'mimo-m', content: [], usage: { input_tokens: 11, output_tokens: 0 } } },
            { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
            { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: REPLY } },
            { type: 'content_block_stop', index: 0 },
            { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 7 } },
            { type: 'message_stop' },
          ];
          res.end(events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join(''));
        } else {
          res.setHeader('Content-Type', 'application/json');
          res.end(handler(req, body));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

const port = (s: http.Server) => (s.address() as AddressInfo).port;
const PROMPT = 'SECRET-PROMPT-PHRASE see /home/user/private.txt';
const REPLY = 'SECRET-REPLY-PHRASE';

describe('council OTLP context events', () => {
  let gateway: http.Server;
  let collector: http.Server;
  const gwSeen: Seen[] = [];
  const colSeen: Seen[] = [];
  const saved = { ...process.env };

  const config = (): CouncilConfig =>
    ({
      providers: {
        mimo: { name: 'mimo', displayName: 'Mimo', apiKey: 'k', baseURL: `http://127.0.0.1:${port(gateway)}/v1`, model: 'mimo-m' },
      },
    }) as unknown as CouncilConfig;

  beforeEach(async () => {
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('OTEL_')) delete process.env[key];
    }
    gwSeen.length = 0;
    colSeen.length = 0;
    gateway = await listen(
      () =>
        JSON.stringify({
          id: 'x',
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: REPLY }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 },
        }),
      gwSeen,
    );
    collector = await listen(() => '{}', colSeen);
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port(collector)}`;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'x-otlp-token=test-otlp-token';
  });

  afterEach(async () => {
    await flushTelemetry();
    gateway.close();
    collector.close();
    process.env = { ...saved };
  });

  it('sends traceparent and one context-only record per call', async () => {
    const results = await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('success');

    await flushTelemetry();
    const [, , traceId, spanId, flags] = ('x-' + gwSeen[0].headers.traceparent).split('-');
    expect(flags).toBe('01');
    expect(colSeen).toHaveLength(1);
    expect(colSeen[0].path).toBe('/v1/logs');
    expect(colSeen[0].headers['x-otlp-token']).toBe('test-otlp-token');
    const record = JSON.parse(colSeen[0].body).resourceLogs[0].scopeLogs[0].logRecords[0];
    expect([record.traceId, record.spanId]).toEqual([traceId, spanId]);
    const attrs = Object.fromEntries(record.attributes.map((a: { key: string; value: object }) => [a.key, Object.values(a.value)[0]]));
    expect(attrs).toMatchObject({ harness: 'council', purpose: 'judge', 'gen_ai.request.model': 'mimo-m', outcome: 'ok', device: hostname() });
  });

  it('never sends prompt or response text, tokens or cost', async () => {
    await runCouncil(config(), { models: ['mimo'], prompt: PROMPT, systemPrompt: 'SECRET-SYSTEM-PHRASE' } as never);
    await flushTelemetry();
    const raw = colSeen[0].body;
    expect(raw).not.toMatch(/SECRET|private\.txt/);
    expect(raw).not.toMatch(/"key":"[^"]*(token|cost|usage)/);
  });

  it('records a failed call as outcome error without error text', async () => {
    const cfg = config();
    gateway.close();
    const results = await runCouncil(cfg, { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('error');
    await flushTelemetry();
    const attrs = JSON.parse(colSeen[0].body).resourceLogs[0].scopeLogs[0].logRecords[0].attributes;
    expect(attrs.find((a: { key: string }) => a.key === 'outcome').value.stringValue).toBe('error');
    expect(colSeen[0].body).not.toMatch(/ECONNREFUSED|SECRET/);
  });

  it('sends nothing when no OTLP endpoint is set', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
    const results = await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('success');
    expect(colSeen).toHaveLength(0);
    expect(gwSeen[0].headers.traceparent).toBeUndefined();
  });

  it('isolates review and plan traces while sharing each run trace across judges', async () => {
    const cfg = config();
    cfg.providers.other = { ...cfg.providers.mimo, name: 'other' };
    for (const run of [runReview, runReview, runPlan]) {
      await run({ config: cfg, models: ['mimo', 'other'], prompt: PROMPT });
    }
    await flushTelemetry();
    const traces = gwSeen.map((s) => String(s.headers.traceparent).split('-')[1]);
    expect(traces[0]).toBe(traces[1]);
    expect(traces[2]).toBe(traces[3]);
    expect(traces[4]).toBe(traces[5]);
    expect(new Set(traces).size).toBe(3);
    expect(new Set(gwSeen.map((s) => s.headers.traceparent)).size).toBe(6);
    expect(colSeen).toHaveLength(6);
  });

  it('does not wait for a stalled collector between debate turns', async () => {
    collector.close();
    collector = http.createServer((req) => { req.resume(); });
    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${port(collector)}`;
    const cfg = config();
    cfg.providers.other = { ...cfg.providers.mimo, name: 'other' };
    const start = Date.now();
    const runs = await Promise.all([1, 2].map(() => runDebate(cfg, {
      prompt: PROMPT, models: ['mimo', 'other'], participate: false, maxRounds: 3,
    })));
    expect(runs.map((r) => r.turns.length)).toEqual([6, 6]);
    expect(Date.now() - start).toBeLessThan(1500);
    const groups = new Map<string, number>();
    for (const seen of gwSeen) {
      const trace = String(seen.headers.traceparent).split('-')[1];
      groups.set(trace, (groups.get(trace) ?? 0) + 1);
    }
    expect([...groups.values()]).toEqual([6, 6]);
    const flushStart = Date.now();
    await flushTelemetry();
    expect(Date.now() - flushStart).toBeLessThan(1700);
    collector.closeAllConnections();
  });

  it.each([
    ['openai', 'sdk'], ['anthropic', 'sdk'],
    ['openai', 'endpoint'], ['anthropic', 'endpoint'],
  ] as const)('honors telemetry disablement for %s via %s', async (kind, mode) => {
    if (mode === 'sdk') process.env.OTEL_SDK_DISABLED = 'true';
    else delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const cfg = config();
    cfg.providers.mimo.kind = kind;
    const results = await runCouncil(cfg, { models: ['mimo'], prompt: PROMPT, maxTokens: 10 } as never);
    expect(results[0].status).toBe('success');
    await flushTelemetry();
    expect(gwSeen).toHaveLength(1);
    expect(gwSeen[0].headers.traceparent).toBeUndefined();
    expect(colSeen).toHaveLength(0);
  });

  it('bounds CLI shutdown once across stalled exports', async () => {
    collector.close();
    collector = http.createServer((req) => {
      req.resume();
      colSeen.push({ path: req.url ?? '', headers: req.headers, body: '' });
    });
    await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
    const start = Date.now();
    const child = spawn(process.execPath, ['--import', 'tsx', 'src/cli.ts', 'debate', 'run', PROMPT,
      '--models', 'mimo,other', '--no-participate', '--max-rounds', '3'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        XDG_STATE_HOME: process.cwd(),
        OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${port(collector)}`,
        COUNCIL_PROVIDERS: 'mimo,other',
        MIMO_API_KEY: 'k', MIMO_MODEL: 'mimo-m', MIMO_BASE_URL: `http://127.0.0.1:${port(gateway)}/v1`,
        OTHER_API_KEY: 'k', OTHER_MODEL: 'other-m', OTHER_BASE_URL: `http://127.0.0.1:${port(gateway)}/v1`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    child.stdout.resume();
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const code = await new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    expect(stderr).toBe('');
    expect(code).toBe(0);
    expect(gwSeen).toHaveLength(6);
    expect(colSeen).toHaveLength(6);
    expect(Date.now() - start).toBeLessThan(4000);
    collector.closeAllConnections();
  }, 10000);

  it('decodes OTEL header and resource values and tolerates malformed escapes', async () => {
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'Authorization=Bearer%20abc,x-malformed=bad%ZZ';
    process.env.OTEL_RESOURCE_ATTRIBUTES = 'deployment.environment=team%2Cblue,malformed=bad%ZZ';
    await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    await flushTelemetry();
    expect(colSeen[0].headers.authorization).toBe('Bearer abc');
    expect(colSeen[0].headers['x-malformed']).toBe('bad%ZZ');
    const attrs = JSON.parse(colSeen[0].body).resourceLogs[0].resource.attributes;
    expect(attrs).toContainEqual({ key: 'deployment.environment', value: { stringValue: 'team,blue' } });
    expect(attrs).toContainEqual({ key: 'malformed', value: { stringValue: 'bad%ZZ' } });
  });

  it('does not fail the run when the collector is down', async () => {
    collector.close();
    const results = await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('success');
  });
});
