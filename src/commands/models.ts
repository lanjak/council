import { loadConfig, listProviders, type CouncilConfig } from '../config.js';
import { loadProvider } from '../providers/index.js';
import { CouncilError } from '../errors.js';
import { escapeComma } from '../output.js';
import type { ModelInfo } from '../providers/base.js';

export interface EndpointModels {
  /** Provider key to use as `<provider>:<model>` in --models. */
  provider: string;
  /** Other configured keys that share this endpoint and API key. */
  aliases: string[];
  models: ModelInfo[];
  error?: string;
}

// Providers that share kind, base URL and key are one gateway: list it once.
export async function collectModels(config: CouncilConfig, keys: string[]): Promise<EndpointModels[]> {
  const groups = new Map<string, string[]>();
  for (const key of keys) {
    const p = config.providers[key];
    if (!p) throw new CouncilError(`No configuration for provider "${key}"`, 'BAD_ARG');
    const id = JSON.stringify([p.kind ?? 'openai', p.baseURL, p.apiKey]);
    groups.set(id, [...(groups.get(id) ?? []), key]);
  }

  return Promise.all(
    [...groups.values()].map(async ([provider, ...aliases]): Promise<EndpointModels> => {
      try {
        const models = await loadProvider(provider, config.providers[provider]).listModels();
        return { provider, aliases, models: models.sort((a, b) => a.id.localeCompare(b.id)) };
      } catch (err) {
        return { provider, aliases, models: [], error: err instanceof Error ? err.message : String(err) };
      }
    })
  );
}

export function renderModels(endpoints: EndpointModels[], filter?: string): string {
  const needle = filter?.toLowerCase();
  const picks = endpoints.flatMap((e) =>
    e.models.filter((m) => !needle || m.id.toLowerCase().includes(needle)).map((m) => ({ provider: e.provider, ...m }))
  );
  const rows = picks.map((m) => `  ${m.provider},${escapeComma(m.id)},${m.context ?? ''}`);
  const lines = [`models[${rows.length}]{provider,model,context}:`, ...rows];
  if (rows.length === 0) lines.push('  (none listed)');

  const shared = endpoints.filter((e) => e.aliases.length > 0);
  if (shared.length > 0) {
    lines.push(`shared[${shared.length}]:`);
    for (const e of shared) lines.push(`  ${e.provider} endpoint also serves ${e.aliases.join(',')}`);
  }

  const failed = endpoints.filter((e) => e.error !== undefined);
  if (failed.length > 0) {
    lines.push(`errors[${failed.length}]:`);
    for (const e of failed) lines.push(`  ${e.provider}: ${e.error}`);
  }

  const example = picks.slice(0, 2).map((m) => `${m.provider}:${m.id}`).join(',');
  lines.push('help[2]:');
  lines.push('  Pick any listed model as <provider>:<model> in --models');
  lines.push(`  Run \`npx -y @lanjak/council review "<prompt>" --models ${example || '<provider>:<model>'}\``);
  return lines.join('\n');
}

export async function modelsCommand(providers: string[], options: { filter?: string }): Promise<void> {
  const config = loadConfig();
  const keys = providers.length > 0 ? providers : listProviders(config);
  if (keys.length === 0) {
    throw new CouncilError('No providers configured. Set COUNCIL_PROVIDERS first.', 'NO_PROVIDERS');
  }
  const endpoints = await collectModels(config, keys);
  console.log(renderModels(endpoints, options.filter));
  if (endpoints.every((e) => e.error !== undefined)) process.exitCode = 1;
}
