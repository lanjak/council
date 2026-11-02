import { describe, it, expect } from 'vitest';
import { loadConfig, listProviders, resolveModels, lookupProvider } from '../src/config.js';
import { parseModelList } from '../src/input.js';
import { CouncilError } from '../src/errors.js';
import type { ProviderConfig } from '../src/types.js';

describe('config', () => {
  it('loads configured providers from COUNCIL_PROVIDERS', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'openai,groq',
      OPENAI_API_KEY: 'openai-key',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_MODEL: 'gpt-4o',
      GROQ_API_KEY: 'groq-key',
      GROQ_BASE_URL: 'https://api.groq.com/openai/v1',
      GROQ_MODEL: 'llama-3.1-70b',
    });

    expect(listProviders(config)).toEqual(['openai', 'groq']);
    expect(config.providers.openai.apiKey).toBe('openai-key');
    expect(config.providers.openai.baseURL).toBe('https://api.openai.com/v1');
    expect(config.providers.openai.model).toBe('gpt-4o');
    expect(config.providers.groq.model).toBe('llama-3.1-70b');
  });

  it('defaults to empty when COUNCIL_PROVIDERS is unset', () => {
    const config = loadConfig({});
    expect(listProviders(config)).toEqual([]);
  });

  it('uses display name override', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'custom',
      CUSTOM_API_KEY: 'key',
      CUSTOM_BASE_URL: 'https://custom.example/v1',
      CUSTOM_MODEL: 'model',
      CUSTOM_DISPLAY_NAME: 'My Custom Provider',
    });

    expect(config.providers.custom.displayName).toBe('My Custom Provider');
  });

  it('reads a positive MAX_TOKENS override and ignores invalid values', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'mimo,deepseek,bad',
      MIMO_API_KEY: 'k',
      MIMO_BASE_URL: 'https://api.xiaomimimo.com/v1',
      MIMO_MODEL: 'mimo-v2.5-pro',
      MIMO_MAX_TOKENS: '65536',
      DEEPSEEK_API_KEY: 'k',
      DEEPSEEK_BASE_URL: 'https://api.deepseek.com/v1',
      DEEPSEEK_MODEL: 'deepseek-v4-pro',
      BAD_API_KEY: 'k',
      BAD_BASE_URL: 'https://bad.example/v1',
      BAD_MODEL: 'bad',
      BAD_MAX_TOKENS: 'not-a-number',
    });

    expect(config.providers.mimo.maxTokens).toBe(65536);
    expect(config.providers.deepseek.maxTokens).toBeUndefined();
    expect(config.providers.bad.maxTokens).toBeUndefined();
  });

  it('capitalizes provider key for display name when not overridden', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'my_provider',
      MY_PROVIDER_API_KEY: 'key',
      MY_PROVIDER_BASE_URL: 'https://example.com/v1',
      MY_PROVIDER_MODEL: 'model',
    });

    expect(config.providers.my_provider.displayName).toBe('My_provider');
  });

  it('defaults kind to openai when _KIND is unset', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'openai',
      OPENAI_API_KEY: 'k',
      OPENAI_BASE_URL: 'https://api.openai.com/v1',
      OPENAI_MODEL: 'gpt-4o',
    });
    expect(config.providers.openai.kind).toBe('openai');
  });

  it('reads kind: anthropic case-insensitively', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'claude',
      CLAUDE_API_KEY: 'sk-ant-...',
      CLAUDE_MODEL: 'claude-opus-5',
      CLAUDE_KIND: 'Anthropic',
    });
    expect(config.providers.claude.kind).toBe('anthropic');
  });

  it('throws a BAD_KIND CouncilError on an unrecognized _KIND value', () => {
    const badConfig = {
      COUNCIL_PROVIDERS: 'claude',
      CLAUDE_API_KEY: 'sk-ant-...',
      CLAUDE_MODEL: 'claude-opus-5',
      CLAUDE_KIND: 'anthropicc',
    };
    expect(() => loadConfig(badConfig)).toThrow(CouncilError);
    try {
      loadConfig(badConfig);
    } catch (err) {
      expect((err as CouncilError).code).toBe('BAD_KIND');
    }
  });

  it('defaults kind to openai when _KIND is whitespace-only', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'claude',
      CLAUDE_API_KEY: 'sk-ant-...',
      CLAUDE_MODEL: 'claude-opus-5',
      CLAUDE_KIND: '   ',
    });
    expect(config.providers.claude.kind).toBe('openai');
  });
});

describe('temperature env override', () => {
  it('parses <PREFIX>_TEMPERATURE and ignores invalid values', () => {
    const config = loadConfig({
      COUNCIL_PROVIDERS: 'kimi,mimo,bad',
      KIMI_API_KEY: 'k', KIMI_BASE_URL: 'https://x/v1', KIMI_MODEL: 'k3', KIMI_TEMPERATURE: '1',
      MIMO_API_KEY: 'k', MIMO_BASE_URL: 'https://x/v1', MIMO_MODEL: 'm',
      BAD_API_KEY: 'k', BAD_BASE_URL: 'https://x/v1', BAD_MODEL: 'b', BAD_TEMPERATURE: 'warm',
    });
    expect(config.providers.kimi.temperature).toBe(1);
    expect(config.providers.mimo.temperature).toBeUndefined();
    expect(config.providers.bad.temperature).toBeUndefined();
  });
});

describe('resolveModels', () => {
  const providers: Record<string, ProviderConfig> = {
    alpha: { name: 'alpha', apiKey: 'k', baseURL: 'u', displayName: 'Alpha', model: 'm' },
    beta: { name: 'beta', apiKey: 'k', baseURL: 'u', displayName: 'Beta', model: 'm' },
  };
  const config = { providers };

  it('returns the explicit list when given', () => {
    expect(resolveModels(['beta'], config)).toEqual(['beta']);
  });

  it('drops empty entries rather than requesting a provider named ""', () => {
    expect(resolveModels(['alpha', '', ' '], config)).toEqual(['alpha']);
  });

  it('falls back to every configured provider', () => {
    expect(resolveModels(undefined, config)).toEqual(['alpha', 'beta']);
  });

  it('throws NO_PROVIDERS when nothing is configured', () => {
    expect(() => resolveModels(undefined, { providers: {} })).toThrow(CouncilError);
    try {
      resolveModels(undefined, { providers: {} });
    } catch (err) {
      expect((err as CouncilError).code).toBe('NO_PROVIDERS');
    }
  });

  it('throws BAD_ARG when --models was given but listed no providers', () => {
    expect(() => resolveModels(['', ' '], config)).toThrow(CouncilError);
    try {
      resolveModels(['', ' '], config);
    } catch (err) {
      expect((err as CouncilError).code).toBe('BAD_ARG');
    }
  });

  it('treats an explicitly empty array as "not specified" and uses all providers', () => {
    expect(resolveModels([], config)).toEqual(['alpha', 'beta']);
  });

  it('rejects a garbled --models flag through the real CLI composition', () => {
    // The composition every command uses. This is what the CLI actually runs.
    expect(() => resolveModels(parseModelList(',,'), config)).toThrow(CouncilError);
    try {
      resolveModels(parseModelList(',,'), config);
    } catch (err) {
      expect((err as CouncilError).code).toBe('BAD_ARG');
    }
  });

  it('still resolves a valid list through the real CLI composition', () => {
    expect(resolveModels(parseModelList('alpha, beta'), config)).toEqual(['alpha', 'beta']);
  });

  it('still tolerates stray empties inside an otherwise valid list', () => {
    expect(resolveModels(parseModelList('alpha,,beta'), config)).toEqual(['alpha', 'beta']);
  });

  it('prefers explicit --models over COUNCIL_MODELS over every provider', () => {
    const withDefaults = loadConfig({
      COUNCIL_PROVIDERS: 'alpha,beta',
      COUNCIL_MODELS: ' alpha:big , ,beta ',
    });
    expect(resolveModels(['beta'], withDefaults)).toEqual(['beta']);
    expect(resolveModels(undefined, withDefaults)).toEqual(['alpha:big', 'beta']);
    expect(resolveModels(undefined, loadConfig({ COUNCIL_PROVIDERS: 'alpha,beta' }))).toEqual(['alpha', 'beta']);
  });

  it('falls back to every provider when COUNCIL_MODELS lists nothing', () => {
    expect(resolveModels(undefined, loadConfig({ COUNCIL_PROVIDERS: 'alpha', COUNCIL_MODELS: ' , ' }))).toEqual(['alpha']);
  });
});

describe('COUNCIL_MODELS', () => {
  it('parses a trimmed default judge list without checking it against providers', () => {
    const config = loadConfig({ COUNCIL_PROVIDERS: 'gw', COUNCIL_MODELS: 'gw:llama3:8b, unknown ,,gw' });
    expect(config.defaultModels).toEqual(['gw:llama3:8b', 'unknown', 'gw']);
  });

  it('is absent when unset', () => {
    expect(loadConfig({ COUNCIL_PROVIDERS: 'gw' }).defaultModels).toBeUndefined();
  });
});

describe('lookupProvider', () => {
  const providers = {
    gw: { name: 'gw', apiKey: 'k', baseURL: 'https://gw.example/v1', model: 'default-model' },
  };

  it('returns a configured provider by key', () => {
    expect(lookupProvider(providers, 'gw')?.model).toBe('default-model');
  });

  it('overrides the model for <provider>:<model> and splits at the first colon only', () => {
    expect(lookupProvider(providers, 'gw:kimi-k3')).toMatchObject({ baseURL: 'https://gw.example/v1', model: 'kimi-k3' });
    expect(lookupProvider(providers, 'gw:llama3:8b')?.model).toBe('llama3:8b');
    expect(providers.gw.model).toBe('default-model');
  });

  it('returns undefined for an unknown provider or an empty model', () => {
    expect(lookupProvider(providers, 'other:kimi-k3')).toBeUndefined();
    expect(lookupProvider(providers, 'gw:')).toBeUndefined();
    expect(lookupProvider(providers, ':kimi-k3')).toBeUndefined();
  });
});
