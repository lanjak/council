import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join } from 'node:path';
import type { ChatOptions, ChatResult, LLMProvider } from './providers/base.js';

// Context-only telemetry. One OTLP log record per model call: ids, role, model,
// device, outcome, duration. Never prompt or response text, tokens or cost
// (the gateway is authoritative for those).

// One trace per council session (one process run); one span per call.
const sessionTraceId = randomBytes(16).toString('hex');

function otlpConfig(): { url: string; headers: Record<string, string> } | null {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;
  const headers: Record<string, string> = {};
  for (const pair of (process.env.OTEL_EXPORTER_OTLP_HEADERS ?? '').split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) headers[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
  }
  if (!headers['x-otlp-token']) {
    try {
      headers['x-otlp-token'] = readFileSync(join(homedir(), '.openclaude', 'keys', 'otlp-token'), 'utf8').trim();
    } catch {
      /* no token file */
    }
  }
  if (!headers['x-otlp-token']) return null; // the receiver would reject it
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? 'http://lanjak-srv.nbnet.lanjak.net:4318';
  return { url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? `${base.replace(/\/$/, '')}/v1/logs`, headers };
}

type Outcome = 'ok' | 'error' | 'timeout' | 'rate_limited';

function outcomeOf(err: unknown): Outcome {
  const status = (err as { status?: number } | null)?.status;
  if (status === 429) return 'rate_limited';
  const name = (err as { name?: string } | null)?.name ?? '';
  if (status === 408 || /timeout/i.test(name)) return 'timeout';
  return 'error';
}

// Fire-and-forget: short timeout, swallows every error.
async function emit(spanId: string, role: string, model: string, outcome: Outcome, durationMs: number): Promise<void> {
  try {
    const cfg = otlpConfig();
    if (!cfg) return;
    const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
    const host = hostname();
    const body = {
      resourceLogs: [
        {
          resource: {
            attributes: [
              str('service.name', 'council'),
              str('host.name', host),
              str('device.name', host),
              str('deployment.environment', 'home'),
            ],
          },
          scopeLogs: [
            {
              scope: { name: 'council' },
              logRecords: [
                {
                  timeUnixNano: String(BigInt(Date.now()) * 1000000n),
                  severityNumber: outcome === 'ok' ? 9 : 17,
                  traceId: sessionTraceId,
                  spanId,
                  attributes: [
                    str('event.name', 'council.call'),
                    str('harness', 'council'),
                    str('purpose', role),
                    str('gen_ai.request.model', model),
                    str('device', host),
                    str('outcome', outcome),
                    { key: 'duration_ms', value: { intValue: String(Math.round(durationMs)) } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    /* telemetry must never fail the command */
  }
}

/** provider.chat with a traceparent header and one context event afterwards. */
export async function tracedChat(provider: LLMProvider, role: string, options: ChatOptions): Promise<ChatResult> {
  const spanId = randomBytes(8).toString('hex');
  const start = Date.now();
  let outcome: Outcome = 'ok';
  try {
    return await provider.chat({ ...options, traceparent: `00-${sessionTraceId}-${spanId}-01` });
  } catch (err) {
    outcome = outcomeOf(err);
    throw err;
  } finally {
    await emit(spanId, role, options.model, outcome, Date.now() - start);
  }
}
