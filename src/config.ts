import type { ProviderConfig } from './types.js';
import { CouncilError } from './errors.js';

export interface CouncilConfig {
  providers: Record<string, ProviderConfig>;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): CouncilConfig {
  const providers: Record<string, ProviderConfig> = {};

  const configured = env.COUNCIL_PROVIDERS?.split(',').map((p) => p.trim()).filter(Boolean) ?? [];

  for (const provider of configured) {
    const prefix = provider.toUpperCase();
    const apiKey = env[`${prefix}_API_KEY`] ?? '';
    const baseURL = env[`${prefix}_BASE_URL`] ?? '';
    const model = env[`${prefix}_MODEL`];
    const displayName = env[`${prefix}_DISPLAY_NAME`] ?? capitalize(provider);
    const maxTokens = parsePositiveInt(env[`${prefix}_MAX_TOKENS`]);
    const temperature = parseTemperature(env[`${prefix}_TEMPERATURE`]);
    const kind = parseKind(env[`${prefix}_KIND`], prefix);

    providers[provider] = {
      name: provider,
      apiKey,
      baseURL,
      model,
      displayName,
      maxTokens,
      temperature,
      kind,
    };
  }

  return { providers };
}

function capitalize(text: string): string {
  return text.replace(/\b\w/g, (c) => c.toUpperCase());
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

function parseTemperature(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function parseKind(value: string | undefined, prefix: string): 'openai' | 'anthropic' {
  // Trim BEFORE the emptiness check: a whitespace-only value (e.g. a stray
  // space from a sloppy .env edit) must default to 'openai' like an unset
  // or empty value, not throw - trimming after the check would only catch
  // the empty-string case and treat whitespace as an unrecognized value.
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === '') return 'openai';
  if (normalized === 'openai') return 'openai';
  if (normalized === 'anthropic') return 'anthropic';
  throw new CouncilError(
    `Unrecognized ${prefix}_KIND "${value}" (expected "openai" or "anthropic")`,
    'BAD_KIND'
  );
}

export function listProviders(config: CouncilConfig): string[] {
  return Object.keys(config.providers);
}

export function resolveModel(providerConfig: ProviderConfig): string | undefined {
  return providerConfig.model;
}

// One resolver for every command. Previously duplicated three times, and the
// copies had drifted: only debate filtered empty entries, so `--models a,,b`
// asked review and plan for a provider named "".
export function resolveModels(
  models: string[] | undefined,
  providers: Record<string, ProviderConfig>
): string[] {
  const explicit = (models ?? []).map((m) => m.trim()).filter((m) => m.length > 0);
  if (explicit.length > 0) return explicit;

  // A supplied-but-empty list is a typo, not a request for every provider.
  if (models !== undefined && models.length > 0) {
    throw new CouncilError('--models was given but listed no providers', 'BAD_ARG');
  }

  const configured = Object.keys(providers);
  if (configured.length === 0) {
    throw new CouncilError(
      'No providers configured. Set COUNCIL_PROVIDERS or pass --models.',
      'NO_PROVIDERS'
    );
  }
  return configured;
}
