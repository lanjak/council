import { describe, it, expect, vi } from 'vitest';
import { collectModels, renderModels } from '../../src/commands/models.js';
import { loadProvider } from '../../src/providers/index.js';
import type { CouncilConfig } from '../../src/config.js';

vi.mock('../../src/providers/index.js', () => ({ loadProvider: vi.fn() }));

const gateway = { apiKey: 'k', baseURL: 'https://gw.example/v1' };
const config: CouncilConfig = {
  providers: {
    kimi: { name: 'kimi', ...gateway, model: 'kimi-k3' },
    mimo: { name: 'mimo', ...gateway, model: 'mimo-v2.6-pro' },
    dead: { name: 'dead', apiKey: 'k', baseURL: 'https://dead.example/v1' },
  },
};

describe('collectModels', () => {
  it('lists a shared gateway once and reports a failing endpoint without throwing', async () => {
    vi.mocked(loadProvider).mockClear().mockImplementation((name) => ({
      listModels: name === 'dead'
        ? vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'))
        : vi.fn().mockResolvedValue([{ id: 'mimo-v2.6-pro' }, { id: 'kimi-k3', context: 262144 }]),
    }) as any);

    const endpoints = await collectModels(config, ['kimi', 'mimo', 'dead']);

    expect(vi.mocked(loadProvider).mock.calls.map((c) => c[0])).toEqual(['kimi', 'dead']);
    expect(endpoints[0]).toMatchObject({ provider: 'kimi', aliases: ['mimo'] });
    expect(endpoints[0].models.map((m) => m.id)).toEqual(['kimi-k3', 'mimo-v2.6-pro']);
    expect(endpoints[1]).toMatchObject({ provider: 'dead', models: [], error: 'connect ECONNREFUSED' });

    const out = renderModels(endpoints);
    expect(out).toContain('models[2]{provider,model,context}:');
    expect(out).toContain('  kimi,kimi-k3,262144');
    expect(out).toContain('kimi endpoint also serves mimo');
    expect(out).toContain('  dead: connect ECONNREFUSED');
    expect(out).toContain('--models kimi:kimi-k3,kimi:mimo-v2.6-pro');
  });

  it('rejects an unknown provider key', async () => {
    await expect(collectModels(config, ['nope'])).rejects.toThrow('No configuration for provider "nope"');
  });
});

describe('renderModels', () => {
  it('filters model IDs case-insensitively', () => {
    const out = renderModels(
      [{ provider: 'gw', aliases: [], models: [{ id: 'Kimi-K3' }, { id: 'gpt-6-luna' }] }],
      'kimi'
    );
    expect(out).toContain('models[1]{provider,model,context}:');
    expect(out).not.toContain('gpt-6-luna');
  });
});
