import { randomBytes } from 'node:crypto';
import { hostname } from 'node:os';
import type { ChatOptions, ChatResult, LLMProvider } from './providers/base.js';

// Context-only telemetry. One OTLP log record per model call: ids, role, model,
// device, outcome, duration. Never prompt or response text, tokens or cost
// (the gateway is authoritative for those).

export function createTraceId(): string | undefined {
  return otlpConfig() ? randomBytes(16).toString('hex') : undefined;
}

const pending = new Set<Promise<void>>();

export async function flushTelemetry(): Promise<void> {
  if (!pending.size) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([...pending]),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, 1500); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Parses the OTEL "k=v,k=v" list format used by the headers and resource variables.
function pairs(raw: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const i = pair.indexOf('=');
    if (i > 0) {
      const value = pair.slice(i + 1).trim();
      try {
        out[pair.slice(0, i).trim()] = decodeURIComponent(value);
      } catch {
        out[pair.slice(0, i).trim()] = value;
      }
    }
  }
  return out;
}

// Off unless an OTLP endpoint is set, like the OpenTelemetry SDKs.
function otlpConfig(): { url: string; headers: Record<string, string> } | null {
  if (process.env.OTEL_SDK_DISABLED === 'true') return null;
  const base = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const url = process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ?? (base ? `${base.replace(/\/$/, '')}/v1/logs` : undefined);
  if (!url) return null;
  return { url, headers: pairs(process.env.OTEL_EXPORTER_OTLP_HEADERS) };
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
async function emit(traceId: string, spanId: string, role: string, model: string, outcome: Outcome, durationMs: number): Promise<void> {
  try {
    const cfg = otlpConfig();
    if (!cfg) return;
    const str = (key: string, value: string) => ({ key, value: { stringValue: value } });
    const host = hostname();
    const body = {
      resourceLogs: [
        {
          resource: {
            attributes: Object.entries({
              'service.name': 'council',
              'host.name': host,
              ...pairs(process.env.OTEL_RESOURCE_ATTRIBUTES),
            }).map(([k, v]) => str(k, v)),
          },
          scopeLogs: [
            {
              scope: { name: 'council' },
              logRecords: [
                {
                  timeUnixNano: String(BigInt(Date.now()) * 1000000n),
                  severityNumber: outcome === 'ok' ? 9 : 17,
                  traceId,
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
    const response = await fetch(cfg.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cfg.headers },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1500),
    });
    await response.body?.cancel();
  } catch {
    /* telemetry must never fail the command */
  }
}

/** provider.chat with a traceparent header and one context event afterwards. */
export async function tracedChat(provider: LLMProvider, role: string, options: ChatOptions, traceId: string | undefined): Promise<ChatResult> {
  if (!traceId || !otlpConfig()) return provider.chat(options);
  const spanId = randomBytes(8).toString('hex');
  const start = Date.now();
  let outcome: Outcome = 'ok';
  try {
    return await provider.chat({ ...options, traceparent: `00-${traceId}-${spanId}-01` });
  } catch (err) {
    outcome = outcomeOf(err);
    throw err;
  } finally {
    const send = emit(traceId, spanId, role, options.model, outcome, Date.now() - start);
    pending.add(send);
    void send.finally(() => pending.delete(send));
  }
}
