import { describe, it, expect, vi } from 'vitest';
import { runPlan } from '../../src/runners/plan.js';
import { loadProvider } from '../../src/providers/index.js';
import { KEY_LABEL } from '../../src/blocks.js';
import type { CouncilConfig } from '../../src/config.js';

vi.mock('../../src/providers/index.js', () => ({ loadProvider: vi.fn() }));

const config: CouncilConfig = {
  providers: {
    alpha: { name: 'alpha', apiKey: 'k', baseURL: 'u', displayName: 'Alpha', model: 'm1' },
    beta: { name: 'beta', apiKey: 'k', baseURL: 'u', displayName: 'Beta', model: 'm2' },
  },
};

function stubProvider(content: string): void {
  vi.mocked(loadProvider).mockReturnValue({ name: 'x', chat: vi.fn().mockResolvedValue({ content }) } as any);
}

describe('runPlan', () => {
  it('returns a CouncilOutput instead of printing', async () => {
    stubProvider('looks fine to me');
    const out = await runPlan({ prompt: 'plan this', config });

    expect(out.mode).toBe('plan');
    expect(out.judges).toHaveLength(2);
    expect(out.availableCount).toBe(2);
    expect(out.totalCount).toBe(2);
    expect(out.synthesis).toContain('looks fine to me');
  });

  it('honours an explicit model list', async () => {
    stubProvider('ok');
    const out = await runPlan({ prompt: 'x', config, models: ['beta'] });
    expect(out.judges.map((j) => j.provider)).toEqual(['beta']);
  });

  it('throws NO_QUORUM when every provider fails', async () => {
    vi.mocked(loadProvider).mockReturnValue({
      name: 'x',
      chat: vi.fn().mockRejectedValue(new Error('down')),
    } as any);
    await expect(runPlan({ prompt: 'x', config })).rejects.toThrow('All providers unavailable');
  });

  it('writes nothing to stdout', async () => {
    stubProvider('ok');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runPlan({ prompt: 'x', config });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('reports blocked with an attributed block', async () => {
    vi.mocked(loadProvider).mockImplementation(
      () =>
        ({
          name: 'x',
          chat: vi.fn(async (o: { system?: string }) => {
            const key = /COUNCIL-BLOCKS-KEY: ([0-9a-f]+)/.exec(o.system ?? '')?.[1] ?? 'missing';
            return {
              content: `prose\n${KEY_LABEL}: ${key}\nBLOCKERS: 1\nBLOCKER: critical | no rollback plan | plan.md:1`,
            };
          }),
        }) as any
    );
    const out = await runPlan({ prompt: 'x', config });

    expect(out.blocked).toBe(true);
    expect(out.hardBlocks[0]).toEqual({
      provider: 'alpha',
      severity: 'critical',
      title: 'no rollback plan',
      location: 'plan.md:1',
    });
  });
});
