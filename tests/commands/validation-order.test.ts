import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reviewCommand } from '../../src/commands/review.js';
import { planCommand } from '../../src/commands/plan.js';
import { readStdinPayload } from '../../src/stdin.js';
import { CouncilError } from '../../src/errors.js';

vi.mock('../../src/stdin.js', () => ({ readStdinPayload: vi.fn() }));
vi.mock('../../src/config.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadConfig: vi.fn(() => ({
    providers: {
      alpha: { name: 'alpha', apiKey: 'k', baseURL: 'u', displayName: 'Alpha', model: 'm' },
    },
  })),
}));

describe('argument validation happens before stdin is read', () => {
  beforeEach(() => {
    vi.mocked(readStdinPayload).mockReset();
    vi.mocked(readStdinPayload).mockResolvedValue('piped content');
  });

  it('review rejects a garbled --models without reading stdin', async () => {
    await expect(
      reviewCommand('x', { models: ',,', stdin: true })
    ).rejects.toThrow(CouncilError);
    expect(readStdinPayload).not.toHaveBeenCalled();
  });

  it('plan rejects a garbled --models without reading stdin', async () => {
    await expect(
      planCommand('x', { models: ',,', stdin: true })
    ).rejects.toThrow(CouncilError);
    expect(readStdinPayload).not.toHaveBeenCalled();
  });
});
