import { describe, it, expect } from 'vitest';
import { loadProvider } from '../../src/providers/index.js';
import { AnthropicProvider } from '../../src/providers/anthropic.js';
import { OpenAICompatibleProvider } from '../../src/providers/openai-compatible.js';
import { CouncilError } from '../../src/errors.js';
import { loadConfig } from '../../src/config.js';

const config = {
  name: 'test',
  displayName: 'Test Provider',
  apiKey: 'sk-test',
  baseURL: 'https://test.example/v1',
  model: 'test-model',
};

describe('provider registry', () => {
  it('loads a generic OpenAI-compatible provider', () => {
    const provider = loadProvider('test', config);
    expect(provider.name).toBe('test');
    expect(provider.displayName).toBe('Test Provider');
  });

  it('loads an AnthropicProvider when kind is anthropic', () => {
    const provider = loadProvider('test', { ...config, kind: 'anthropic' });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('loads an OpenAICompatibleProvider when kind is openai', () => {
    const provider = loadProvider('test', { ...config, kind: 'openai' });
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('loads an OpenAICompatibleProvider when kind is omitted', () => {
    const provider = loadProvider('test', config);
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
  });

  it('throws a BAD_KIND CouncilError when kind is an unrecognized value', () => {
    expect(() => loadProvider('test', { ...config, kind: 'bogus' as any })).toThrow(CouncilError);
    try {
      loadProvider('test', { ...config, kind: 'bogus' as any });
    } catch (err) {
      expect((err as CouncilError).code).toBe('BAD_KIND');
    }
  });

  it('normalizes a mixed-case kind constructed directly (bypassing loadConfig)', () => {
    const provider = loadProvider('test', { ...config, kind: 'Anthropic' as any });
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('loadConfig -> loadProvider wiring: an env-configured anthropic provider resolves to AnthropicProvider', () => {
    // Regression guard for the seam between config.ts's env parsing and
    // providers/index.ts's kind switch - each half is tested in isolation
    // elsewhere; this exercises them together.
    const cfg = loadConfig({
      COUNCIL_PROVIDERS: 'claude',
      CLAUDE_API_KEY: 'sk-ant-...',
      CLAUDE_MODEL: 'claude-opus-5',
      CLAUDE_KIND: 'anthropic',
    });
    const provider = loadProvider('claude', cfg.providers.claude);
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });
});
