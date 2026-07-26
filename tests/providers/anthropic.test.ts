import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic.js';

const config = {
  name: 'test',
  displayName: 'Test Provider',
  apiKey: 'sk-ant-test',
  baseURL: '',
  model: 'test-model',
};

describe('AnthropicProvider', () => {
  it('returns chat content from a single text block', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    } as any);

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('hello');
  });

  it('joins multiple text blocks with a newline', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('first\nsecond');
  });

  it('sends system as a top-level param, not a message', async () => {
    const provider = new AnthropicProvider(config);
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', system: 'be nice', model: 'test-model' });

    const call = create.mock.calls[0][0];
    expect(call.system).toBe('be nice');
    expect(call.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('omits a whitespace-only system prompt entirely', async () => {
    const provider = new AnthropicProvider(config);
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', system: '   ', model: 'test-model' });

    expect('system' in create.mock.calls[0][0]).toBe(false);
  });

  it('omits an empty-string system prompt entirely', async () => {
    const provider = new AnthropicProvider(config);
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', system: '', model: 'test-model' });

    expect('system' in create.mock.calls[0][0]).toBe(false);
  });

  it('filters out non-text content blocks (e.g. tool_use)', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [
        { type: 'tool_use', id: 'x', name: 'noop', input: {} },
        { type: 'text', text: 'hi' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('hi');
  });

  it('maps usage including cache tokens into a computed total', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 3,
      },
    } as any);

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 20 });
  });

  it('defaults missing usage fields to zero', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    } as any);

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('defaults max_tokens to DEFAULT_ANTHROPIC_MAX_TOKENS', async () => {
    const provider = new AnthropicProvider(config);
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(create.mock.calls[0][0].max_tokens).toBe(8192);
  });

  it('honors a per-provider maxTokens override', async () => {
    const provider = new AnthropicProvider({ ...config, maxTokens: 4096 });
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(create.mock.calls[0][0].max_tokens).toBe(4096);
  });

  it('call-option maxTokens wins over both provider config and the default', async () => {
    const provider = new AnthropicProvider({ ...config, maxTokens: 4096 });
    const create = vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

    await provider.chat({ prompt: 'hi', model: 'test-model', maxTokens: 2048 });

    expect(create.mock.calls[0][0].max_tokens).toBe(2048);
  });

  it('propagates API errors as rejections', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'create').mockRejectedValue(new Error('rate limit'));

    await expect(provider.chat({ prompt: 'hi', model: 'test-model' })).rejects.toThrow(
      'rate limit'
    );
  });
});

describe('AnthropicProvider temperature handling', () => {
  const mockCreate = (provider: AnthropicProvider) =>
    vi.spyOn(provider['client'].messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    } as any);

  it('omits temperature entirely when nothing is configured', async () => {
    const provider = new AnthropicProvider(config);
    const create = mockCreate(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model' });
    expect('temperature' in create.mock.calls[0][0]).toBe(false);
  });

  it('sends the provider-config temperature when set', async () => {
    const provider = new AnthropicProvider({ ...config, temperature: 1 });
    const create = mockCreate(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model' });
    expect(create.mock.calls[0][0].temperature).toBe(1);
  });

  it('call option temperature wins over provider config', async () => {
    const provider = new AnthropicProvider({ ...config, temperature: 1 });
    const create = mockCreate(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model', temperature: 0.2 });
    expect(create.mock.calls[0][0].temperature).toBe(0.2);
  });
});

describe('AnthropicProvider.checkAuth', () => {
  it('is unauthenticated when apiKey is missing', async () => {
    const provider = new AnthropicProvider({ ...config, apiKey: '' });
    const auth = await provider.checkAuth();
    expect(auth.authenticated).toBe(false);
  });

  it('is authenticated with apiKey set and no baseURL (default endpoint)', async () => {
    const provider = new AnthropicProvider({ ...config, baseURL: '' });
    const auth = await provider.checkAuth();
    expect(auth.authenticated).toBe(true);
  });

  it('is authenticated with both apiKey and baseURL set', async () => {
    const provider = new AnthropicProvider({ ...config, baseURL: 'https://proxy.example' });
    const auth = await provider.checkAuth();
    expect(auth.authenticated).toBe(true);
  });
});
