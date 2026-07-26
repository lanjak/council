// Reasoning models spend a large share of their completion budget on hidden
// thinking tokens, so a low cap truncates the visible answer mid-sentence.
// mimo-v2.5-pro and deepseek-v4-pro both support 65536; default generously and
// let ${PREFIX}_MAX_TOKENS override per provider.
export const DEFAULT_OPENAI_MAX_TOKENS = 32768;

// Anthropic's max output tokens is model-specific and historically lower
// than the OpenAI-compatible default for some models; a shared default
// risks every request failing until a user overrides ${PREFIX}_MAX_TOKENS.
// 8192 is safe across current Claude models while still generous.
export const DEFAULT_ANTHROPIC_MAX_TOKENS = 8192;
