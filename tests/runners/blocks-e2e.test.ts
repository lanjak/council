import { describe, it, expect, vi } from 'vitest';
import { runReview } from '../../src/runners/review.js';
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

// Echo back a footer using whatever key the runner generated, which is only
// visible via the system prompt handed to the provider.
function respondWith(body: (key: string) => string): void {
  vi.mocked(loadProvider).mockImplementation(
    () =>
      ({
        name: 'x',
        chat: vi.fn(async (o: { system?: string }) => {
          const key = /COUNCIL-BLOCKS-KEY: ([0-9a-f]+)/.exec(o.system ?? '')?.[1] ?? 'missing';
          return { content: body(key) };
        }),
      }) as any
  );
}

describe('runReview hard blocks', () => {
  it('reports blocked with attributed blocks', async () => {
    respondWith((k) => `prose\n${KEY_LABEL}: ${k}\nBLOCKERS: 1\nBLOCKER: critical | no auth | src/a.ts:1`);
    const out = await runReview({ prompt: 'x', config });

    expect(out.blocked).toBe(true);
    expect(out.hardBlocks).toHaveLength(2); // one per judge
    expect(out.hardBlocks[0]).toEqual({
      provider: 'alpha',
      severity: 'critical',
      title: 'no auth',
      location: 'src/a.ts:1',
    });
    expect(out.unknownJudges).toEqual([]);
  });

  it('reports a clean council as not blocked', async () => {
    respondWith((k) => `prose\n${KEY_LABEL}: ${k}\nBLOCKERS: none`);
    const out = await runReview({ prompt: 'x', config });
    expect(out.blocked).toBe(false);
    expect(out.hardBlocks).toEqual([]);
    expect(out.unknownJudges).toEqual([]);
  });

  it('marks a judge unknown without blocking when the footer is absent', async () => {
    respondWith(() => 'I have opinions but no footer.');
    const out = await runReview({ prompt: 'x', config });
    expect(out.blocked).toBe(false);
    expect(out.unknownJudges.map((u) => u.provider)).toEqual(['alpha', 'beta']);
    expect(out.unknownJudges[0].reason).toBe('no-key');
  });

  it('uses a different key per run', async () => {
    const seen: string[] = [];
    respondWith((k) => {
      seen.push(k);
      return `${KEY_LABEL}: ${k}\nBLOCKERS: none`;
    });
    await runReview({ prompt: 'x', config, models: ['alpha'] });
    await runReview({ prompt: 'x', config, models: ['alpha'] });
    expect(seen[0]).not.toBe(seen[1]);
  });
});
