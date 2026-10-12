import { describe, it, expect, vi } from 'vitest';
import { AnthropicProvider } from '../../src/providers/anthropic.js';

const config = {
  name: 'test',
  displayName: 'Test Provider',
  apiKey: 'sk-ant-test',
  baseURL: '',
  model: 'test-model',
};

// AnthropicProvider.chat() calls messages.stream(...).finalMessage(), not
// messages.create(...) - see the comment on that call site for why
// (the SDK's non-streaming path throws client-side above a max_tokens
// threshold). Mock the stream() method's return value accordingly.
function mockStream(provider: AnthropicProvider, message: unknown) {
  return vi.spyOn(provider['client'].messages, 'stream').mockReturnValue({
    finalMessage: () => Promise.resolve(message),
  } as any);
}

describe('AnthropicProvider', () => {
  it.each(['low', 'medium', 'high', 'xhigh'] as const)('sends supported effort %s and per-call token budget', async (effort) => {
    const provider = new AnthropicProvider({ ...config, effort: 'low', maxTokens: 900 });
    const stream = mockStream(provider, { content: [], usage: { input_tokens: 0, output_tokens: 0 } });
    await provider.chat({ prompt: 'q', model: 'm', effort, maxTokens: 1234 });
    expect(stream.mock.calls[0][0]).toMatchObject({ output_config: { effort }, max_tokens: 1234 });
  });

  it('omits unconfigured effort', async () => {
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, { content: [], usage: { input_tokens: 0, output_tokens: 0 } });
    await provider.chat({ prompt: 'q', model: 'm' });
    expect(stream.mock.calls[0][0]).not.toHaveProperty('output_config');
  });
  it('uses configured effort when the call omits it', async () => {
    const provider = new AnthropicProvider({ ...config, effort: 'high' });
    const stream = mockStream(provider, { content: [], usage: { input_tokens: 0, output_tokens: 0 } });
    await provider.chat({ prompt: 'q', model: 'm' });
    expect(stream.mock.calls[0][0]).toHaveProperty('output_config', { effort: 'high' });
  });
  it('returns chat content from a single text block', async () => {
    const provider = new AnthropicProvider(config);
    mockStream(provider, {
      content: [{ type: 'text', text: 'hello' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('hello');
  });

  it('joins multiple text blocks with a newline', async () => {
    const provider = new AnthropicProvider(config);
    mockStream(provider, {
      content: [
        { type: 'text', text: 'first' },
        { type: 'text', text: 'second' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('first\nsecond');
  });

  it('sends system as a top-level param, not a message', async () => {
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', system: 'be nice', model: 'test-model' });

    const call = stream.mock.calls[0][0];
    expect(call.system).toBe('be nice');
    expect(call.messages).toEqual([{ role: 'user', content: 'hi' }]);
  });

  it('omits a whitespace-only system prompt entirely', async () => {
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', system: '   ', model: 'test-model' });

    expect('system' in stream.mock.calls[0][0]).toBe(false);
  });

  it('omits an empty-string system prompt entirely', async () => {
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', system: '', model: 'test-model' });

    expect('system' in stream.mock.calls[0][0]).toBe(false);
  });

  it('filters out non-text content blocks (e.g. tool_use)', async () => {
    const provider = new AnthropicProvider(config);
    mockStream(provider, {
      content: [
        { type: 'tool_use', id: 'x', name: 'noop', input: {} },
        { type: 'text', text: 'hi' },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.content).toBe('hi');
  });

  it('maps usage including cache tokens into a computed total', async () => {
    const provider = new AnthropicProvider(config);
    mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_creation_input_tokens: 2,
        cache_read_input_tokens: 3,
      },
    });

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 20 });
  });

  it('defaults missing usage fields to zero', async () => {
    const provider = new AnthropicProvider(config);
    mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    const result = await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 5, totalTokens: 15 });
  });

  it('defaults max_tokens to DEFAULT_ANTHROPIC_MAX_TOKENS', async () => {
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(stream.mock.calls[0][0].max_tokens).toBe(8192);
  });

  it('honors a per-provider maxTokens override', async () => {
    const provider = new AnthropicProvider({ ...config, maxTokens: 4096 });
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', model: 'test-model' });

    expect(stream.mock.calls[0][0].max_tokens).toBe(4096);
  });

  it('call-option maxTokens wins over both provider config and the default', async () => {
    const provider = new AnthropicProvider({ ...config, maxTokens: 4096 });
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await provider.chat({ prompt: 'hi', model: 'test-model', maxTokens: 2048 });

    expect(stream.mock.calls[0][0].max_tokens).toBe(2048);
  });

  it('uses messages.stream, never messages.create, so a large max_tokens never trips the SDK non-streaming guard', async () => {
    // Regression test: production broke because chat() used to call
    // messages.create() directly, which throws client-side (before any
    // network request) once max_tokens is large enough that a non-streaming
    // call could plausibly exceed 10 minutes - 65536, the value the
    // OpenAI-compatible README already recommends for reasoning models,
    // trips it every time. Asserting create() is never invoked pins the fix.
    const provider = new AnthropicProvider(config);
    const stream = mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const create = vi.spyOn(provider['client'].messages, 'create');

    await provider.chat({ prompt: 'hi', model: 'test-model', maxTokens: 65536 });

    expect(stream.mock.calls[0][0].max_tokens).toBe(65536);
    expect(create).not.toHaveBeenCalled();
  });

  it('propagates API errors as rejections', async () => {
    const provider = new AnthropicProvider(config);
    vi.spyOn(provider['client'].messages, 'stream').mockImplementation(() => {
      throw new Error('rate limit');
    });

    await expect(provider.chat({ prompt: 'hi', model: 'test-model' })).rejects.toThrow(
      'rate limit'
    );
  });
});

describe('AnthropicProvider temperature handling', () => {
  const setup = (provider: AnthropicProvider) =>
    mockStream(provider, {
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });

  it('omits temperature entirely when nothing is configured', async () => {
    const provider = new AnthropicProvider(config);
    const stream = setup(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model' });
    expect('temperature' in stream.mock.calls[0][0]).toBe(false);
  });

  it('sends the provider-config temperature when set', async () => {
    const provider = new AnthropicProvider({ ...config, temperature: 1 });
    const stream = setup(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model' });
    expect(stream.mock.calls[0][0].temperature).toBe(1);
  });

  it('call option temperature wins over provider config', async () => {
    const provider = new AnthropicProvider({ ...config, temperature: 1 });
    const stream = setup(provider);
    await provider.chat({ prompt: 'hi', model: 'test-model', temperature: 0.2 });
    expect(stream.mock.calls[0][0].temperature).toBe(0.2);
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
