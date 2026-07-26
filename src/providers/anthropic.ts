import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, ChatOptions, ChatResult, AuthResult, ProviderCapabilities } from './base.js';
import type { ProviderConfig } from '../types.js';
import { DEFAULT_ANTHROPIC_MAX_TOKENS } from './constants.js';

export class AnthropicProvider extends LLMProvider {
  readonly name: string;
  readonly displayName: string;
  readonly capabilities: ProviderCapabilities;
  protected client: Anthropic;

  constructor(config: ProviderConfig) {
    super(config);
    this.name = config.name ?? 'unknown';
    this.displayName = config.displayName ?? config.name ?? 'Unknown Provider';
    this.capabilities = { supportsReasoning: false, supportsJsonMode: false };
    // config.apiKey is always a string (config.ts defaults it to '' when
    // unset, never undefined), so passing it straight through means the SDK
    // never falls back to an ambient ANTHROPIC_API_KEY from the process
    // environment - the per-judge key stays authoritative.
    this.client = new Anthropic({
      apiKey: config.apiKey,
      ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    });
  }

  async checkAuth(): Promise<AuthResult> {
    // Unlike OpenAICompatibleProvider, baseURL is not required here: the
    // Anthropic SDK has a built-in default endpoint (api.anthropic.com), so
    // the simplest valid config omits ${PREFIX}_BASE_URL entirely.
    if (!this.config.apiKey) {
      return {
        available: true,
        authenticated: false,
        detail: `${this.displayName} API key is not set`,
      };
    }
    return { available: true, authenticated: true, detail: `${this.displayName} API key is set` };
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    const temperature = options.temperature ?? this.config.temperature;
    const system = options.system?.trim() ? options.system : undefined;

    const response = await this.client.messages.create({
      model: options.model,
      max_tokens: options.maxTokens ?? this.config.maxTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
      messages: [{ role: 'user', content: options.prompt }],
      ...(system ? { system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
    });

    // Non-text blocks (tool_use, thinking, etc.) are intentionally dropped:
    // no tool use is requested and extended thinking is off by design (see
    // spec Non-goals), so only `text` blocks are ever expected in practice.
    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    // response.usage is a required field on Anthropic's Message type (never
    // undefined), unlike OpenAI's optional `completion.usage` - no presence
    // check needed here, only per-field ?? 0 fallbacks since the individual
    // numeric fields are nullable.
    //
    // Anthropic's own docs define total input as the SUM of input_tokens,
    // cache_creation_input_tokens, and cache_read_input_tokens (these are
    // NOT overlapping/subset values - input_tokens already excludes cached
    // tokens). totalTokens below reflects that real total. Note this means
    // totalTokens can exceed inputTokens + outputTokens for a cached
    // request, unlike the OpenAI-compatible provider where they're always
    // equal - inputTokens intentionally stays the raw (cache-excluding)
    // input_tokens field, matching Anthropic's own field semantics, rather
    // than folding cache tokens into it to preserve an invariant that
    // nothing downstream actually relies on (checked: no code in this repo
    // computes inputTokens + outputTokens instead of using totalTokens
    // directly).
    const usage = {
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      totalTokens:
        (response.usage.input_tokens ?? 0) +
        (response.usage.output_tokens ?? 0) +
        (response.usage.cache_creation_input_tokens ?? 0) +
        (response.usage.cache_read_input_tokens ?? 0),
    };

    return { content, usage };
  }
}
