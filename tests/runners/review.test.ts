import { describe, it, expect, vi } from 'vitest';
import { runReview } from '../../src/runners/review.js';
import { loadProvider } from '../../src/providers/index.js';
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

describe('runReview', () => {
  it('returns a CouncilOutput instead of printing', async () => {
    stubProvider('looks fine to me');
    const out = await runReview({ prompt: 'review this', config });

    expect(out.mode).toBe('review');
    expect(out.judges).toHaveLength(2);
    expect(out.availableCount).toBe(2);
    expect(out.totalCount).toBe(2);
    expect(out.synthesis).toContain('looks fine to me');
  });

  it('honours an explicit model list', async () => {
    stubProvider('ok');
    const out = await runReview({ prompt: 'x', config, models: ['beta'] });
    expect(out.judges.map((j) => j.provider)).toEqual(['beta']);
  });

  it('throws NO_QUORUM when every provider fails', async () => {
    vi.mocked(loadProvider).mockReturnValue({
      name: 'x',
      chat: vi.fn().mockRejectedValue(new Error('down')),
    } as any);
    await expect(runReview({ prompt: 'x', config })).rejects.toThrow('All providers unavailable');
  });

  it('writes nothing to stdout', async () => {
    stubProvider('ok');
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runReview({ prompt: 'x', config });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
