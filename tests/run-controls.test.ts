import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { runReview } from '../src/runners/review.js';
import { runPlan } from '../src/runners/plan.js';
import { runDebate } from '../src/debate/loop.js';
import { loadProvider } from '../src/providers/index.js';
import { OpenAICompatibleProvider } from '../src/providers/openai-compatible.js';

vi.mock('../src/providers/index.js', () => ({ loadProvider: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
const env = { COUNCIL_PROVIDERS: 'a,b', A_API_KEY: 'key', A_MODEL: 'a', B_API_KEY: 'key', B_MODEL: 'b' };

describe('run controls', () => {
  it('renames the package and CLI', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.name).toBe('@lanjak/council');
    expect(pkg.bin.council).toBe('dist/cli.js');
    expect(readFileSync('src/cli.ts', 'utf8')).toContain(".name('council')");
  });
  it('omits unconfigured effort and honors provider over global env', () => {
    expect(loadConfig(env).providers.a.effort).toBeUndefined();
    const config = loadConfig({ ...env, COUNCIL_EFFORT: 'high', A_EFFORT: 'low' });
    expect(config.providers.a.effort).toBe('low');
    expect(config.providers.b.effort).toBe('high');
  });
  it.each(['none', '', 'HIGH', 'extreme'])('rejects invalid configured effort %j', (effort) => {
    expect(() => loadConfig({ ...env, A_EFFORT: effort })).toThrow(/A_EFFORT/);
  });
  it.each(['review', 'plan', 'debate'] as const)('threads per-run controls to every %s judge', async (mode) => {
    const chat = vi.fn().mockResolvedValue({ content: 'fine\nVERDICT: AGREE' });
    vi.mocked(loadProvider).mockReturnValue({ chat } as any);
    const config = loadConfig({ ...env, A_MAX_TOKENS: '900', COUNCIL_EFFORT: 'low' });
    const options = { prompt: 'q', models: ['a', 'b'], config, maxTokens: 1234, effort: 'xhigh' as const };
    if (mode === 'debate') await runDebate(config, { ...options, participate: false, maxRounds: 2 });
    else await (mode === 'review' ? runReview : runPlan)(options);
    expect(chat).toHaveBeenCalledTimes(2);
    for (const [call] of chat.mock.calls) expect(call).toMatchObject({ maxTokens: 1234, effort: 'xhigh' });
  });
  it('sends effort only when configured in the OpenAI body', async () => {
    for (const [configured, override, expected] of [[undefined, undefined, undefined], ['low', undefined, 'low'], ['low', 'xhigh', 'xhigh'], [undefined, 'high', 'high']] as const) {
      const provider = new OpenAICompatibleProvider({ name: 'a', displayName: 'A', apiKey: 'key', baseURL: 'https://example.com', effort: configured, maxTokens: 900 });
      const create = vi.spyOn(provider['client'].chat.completions, 'create').mockResolvedValue({ choices: [] } as any);
      await provider.chat({ prompt: 'q', model: 'm', effort: override, maxTokens: 1234 });
      expect(create.mock.calls[0][0]).toMatchObject({ max_tokens: 1234 });
      if (expected === undefined) expect(create.mock.calls[0][0]).not.toHaveProperty('reasoning_effort');
      else expect(create.mock.calls[0][0]).toHaveProperty('reasoning_effort', expected);
    }
  });
});
