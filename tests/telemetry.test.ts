import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { hostname } from 'node:os';
import { runCouncil } from '../src/council.js';
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
        res.setHeader('Content-Type', 'application/json');
        res.end(handler(req, body));
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

  afterEach(() => {
    gateway.close();
    collector.close();
    process.env = { ...saved };
  });

  it('sends traceparent and one context-only record per call', async () => {
    const results = await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('success');

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
    const raw = colSeen[0].body;
    expect(raw).not.toMatch(/SECRET|private\.txt/);
    expect(raw).not.toMatch(/"key":"[^"]*(token|cost|usage)/);
  });

  it('records a failed call as outcome error without error text', async () => {
    const cfg = config();
    gateway.close();
    const results = await runCouncil(cfg, { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('error');
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
  });

  it('does not fail the run when the collector is down', async () => {
    collector.close();
    const results = await runCouncil(config(), { models: ['mimo'], prompt: PROMPT } as never);
    expect(results[0].status).toBe('success');
  });
});
