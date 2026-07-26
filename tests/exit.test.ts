import { describe, it, expect } from 'vitest';
import { exitCodeFor } from '../src/exit.js';
import type { CouncilOutput } from '../src/types.js';

const base: CouncilOutput = {
  prompt: 'p',
  mode: 'review',
  judges: [],
  synthesis: 's',
  availableCount: 1,
  totalCount: 1,
  blocked: false,
  hardBlocks: [],
  diagnosticBlocks: [],
  unknownJudges: [],
};

const blocked = { ...base, blocked: true };
const unknown = { ...base, unknownJudges: [{ provider: 'a', reason: 'no-key' as const }] };

describe('exitCodeFor', () => {
  it('defaults to 0 even when blocked', () => {
    expect(exitCodeFor(blocked, {})).toBe(0);
    expect(exitCodeFor(unknown, {})).toBe(0);
  });

  it('returns 3 for a block under --fail-on-block', () => {
    expect(exitCodeFor(blocked, { failOnBlock: true })).toBe(3);
    expect(exitCodeFor(base, { failOnBlock: true })).toBe(0);
  });

  it('returns 4 for unknown judges under --fail-on-unknown', () => {
    expect(exitCodeFor(unknown, { failOnUnknown: true })).toBe(4);
    expect(exitCodeFor(base, { failOnUnknown: true })).toBe(0);
  });

  it('--fail-on-block ignores unknown judges', () => {
    expect(exitCodeFor(unknown, { failOnBlock: true })).toBe(0);
  });

  it('--strict covers both, and a block outranks an unknown', () => {
    expect(exitCodeFor(blocked, { strict: true })).toBe(3);
    expect(exitCodeFor(unknown, { strict: true })).toBe(4);
    expect(exitCodeFor({ ...base, blocked: true, unknownJudges: [{ provider: 'a', reason: 'no-key' as const }] }, { strict: true })).toBe(3);
    expect(exitCodeFor(base, { strict: true })).toBe(0);
  });
});
