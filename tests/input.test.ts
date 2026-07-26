import { describe, it, expect } from 'vitest';
import { buildPrompt, parseModelList } from '../src/input.js';

describe('parseModelList', () => {
  it('returns undefined for undefined', () => {
    expect(parseModelList(undefined)).toBeUndefined();
  });
  it('splits and trims', () => {
    expect(parseModelList('a, b ,c')).toEqual(['a', 'b', 'c']);
  });
  it('preserves empty entries so resolveModels can distinguish absent from empty', () => {
    expect(parseModelList('a,,b')).toEqual(['a', '', 'b']);
  });
});

describe('buildPrompt', () => {
  it('returns the prompt unchanged when there are no artifacts', () => {
    expect(buildPrompt('review this', {})).toEqual({ text: 'review this', warnings: [] });
  });

  it('prepends an artifact preamble when stdin content is supplied', () => {
    const r = buildPrompt('review this', { stdinContent: 'const x = 1;' });
    expect(r.text).toContain('const x = 1;');
    expect(r.text.endsWith('review this')).toBe(true);
  });

  it('is synchronous and never reads process.stdin', () => {
    expect(buildPrompt('x', { stdinContent: 'y' })).not.toBeInstanceOf(Promise);
  });
});
