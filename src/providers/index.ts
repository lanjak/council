import { LLMProvider } from './base.js';
import { OpenAICompatibleProvider } from './openai-compatible.js';
import { AnthropicProvider } from './anthropic.js';
import { CouncilError } from '../errors.js';
import type { ProviderConfig } from '../types.js';

export function loadProvider(name: string, config: ProviderConfig): LLMProvider {
  // Normalize here too, not just in config.ts's env parsing: ProviderConfig
  // can be constructed directly by library consumers who bypass loadConfig
  // (and its literal-union type is only a compile-time guarantee, not a
  // runtime one for callers using `any` or plain JS).
  const kind = (config.kind ?? 'openai').toString().trim().toLowerCase();
  if (kind === 'anthropic') {
    return new AnthropicProvider({ ...config, name });
  }
  if (kind === 'openai') {
    return new OpenAICompatibleProvider({ ...config, name });
  }
  throw new CouncilError(`Unrecognized provider kind "${kind}" for "${name}"`, 'BAD_KIND');
}

export { LLMProvider, OpenAICompatibleProvider, AnthropicProvider };
