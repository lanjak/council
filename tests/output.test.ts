import { describe, it, expect } from 'vitest';
import { renderTOON } from '../src/output.js';
import type { CouncilOutput } from '../src/types.js';

const sample: CouncilOutput = {
  prompt: 'Should we ship?',
  mode: 'review',
  judges: [
    { provider: 'kimi', model: 'kimi-k3', status: 'success', response: 'Yes' },
    { provider: 'deepseek', model: 'deepseek-v4-pro', status: 'error', error: { message: 'rate limit' } },
  ],
  synthesis: 'Yes',
  availableCount: 1,
  totalCount: 2,
  blocked: false,
  hardBlocks: [],
  diagnosticBlocks: [],
  unknownJudges: [],
};

describe('output', () => {
  it('renders TOON output with judge list', () => {
    const toon = renderTOON(sample);
    expect(toon).toContain('council[review]: "Should we ship?"');
    expect(toon).toContain('judges: 1 of 2 responded');
    expect(toon).toContain('kimi,kimi-k3,success,Yes');
    expect(toon).toContain('deepseek,deepseek-v4-pro,error,rate limit');
    expect(toon).toContain('help[');
  });

  it('previews a long prompt instead of echoing it in full', () => {
    const bigPrompt = 'x'.repeat(5000);
    const toon = renderTOON({ ...sample, prompt: bigPrompt });
    const header = toon.split('\n')[0];
    expect(header.length).toBeLessThan(300);
    expect(header).toContain('(5000 chars total)');
    expect(toon).not.toContain('x'.repeat(1000));
  });

  it('renders warnings when present', () => {
    const toon = renderTOON({ ...sample, warnings: ['not found: x.md', 'omitted (cap): y.md'] });
    expect(toon).toContain('warnings[2]:');
    expect(toon).toContain('not found: x.md');
  });
});

describe('renderTOON hard blocks', () => {
  const base = {
    prompt: 'p',
    mode: 'review' as const,
    judges: [{ provider: 'a', model: 'm', status: 'success' as const, response: 'ok' }],
    synthesis: 's',
    availableCount: 1,
    totalCount: 1,
    blocked: false,
    hardBlocks: [],
    diagnosticBlocks: [],
    unknownJudges: [],
  };

  it('renders blocked: no and omits the sections when clean', () => {
    const out = renderTOON(base);
    expect(out).toContain('blocked: no');
    expect(out).not.toContain('blocks[');
    expect(out).not.toContain('diagnostic[');
    expect(out).not.toContain('unknown[');
  });

  it('renders the blocks section when blocked', () => {
    const out = renderTOON({
      ...base,
      blocked: true,
      hardBlocks: [
        { provider: 'a', severity: 'critical', title: 'no auth', location: 'src/a.ts:1' },
      ],
    });
    expect(out).toContain('blocked: yes');
    expect(out).toContain('blocks[1]{provider,severity,title,location}:');
    expect(out).toContain('  a,critical,no auth,src/a.ts:1');
  });

  it('renders an empty location field when absent', () => {
    const out = renderTOON({
      ...base,
      blocked: true,
      hardBlocks: [{ provider: 'a', severity: 'high', title: 'no loc' }],
    });
    expect(out).toContain('  a,high,no loc,');
  });

  it('escapes commas in titles', () => {
    const out = renderTOON({
      ...base,
      blocked: true,
      hardBlocks: [{ provider: 'a', severity: 'high', title: 'first, second' }],
    });
    expect(out).toContain('  a,high,first\\, second,');
  });

  it('renders diagnostic and unknown sections', () => {
    const out = renderTOON({
      ...base,
      diagnosticBlocks: [{ provider: 'b', severity: 'high', title: 'salvaged' }],
      unknownJudges: [{ provider: 'b', reason: 'count-mismatch', detail: 'declared 2, parsed 1' }],
    });
    expect(out).toContain('diagnostic[1]{provider,severity,title,location}:');
    expect(out).toContain('unknown[1]:');
    expect(out).toContain('  b: count-mismatch (declared 2, parsed 1)');
  });

  it('omits the detail parenthetical when there is none', () => {
    const out = renderTOON({ ...base, unknownJudges: [{ provider: 'b', reason: 'no-key' }] });
    expect(out).toContain('  b: no-key');
  });
});
