import { describe, it, expect } from 'vitest';
import { aggregateBlocks } from '../src/blocks.js';
import type { JudgeResult } from '../src/types.js';

function judge(provider: string, blockParse: JudgeResult['blockParse']): JudgeResult {
  return { provider, model: 'm', status: 'success', response: 'x', blockParse };
}

describe('aggregateBlocks', () => {
  it('reports not blocked when every judge parsed clean', () => {
    const r = aggregateBlocks([
      judge('a', { status: 'parsed', blocks: [] }),
      judge('b', { status: 'parsed', blocks: [] }),
    ]);
    expect(r).toEqual({ blocked: false, hardBlocks: [], diagnosticBlocks: [], unknownJudges: [] });
  });

  it('blocks when a single judge reports a block, even if others are clean', () => {
    const r = aggregateBlocks([
      judge('a', { status: 'parsed', blocks: [] }),
      judge('b', { status: 'parsed', blocks: [{ severity: 'critical', title: 'boom' }] }),
    ]);
    expect(r.blocked).toBe(true);
    expect(r.hardBlocks).toEqual([{ provider: 'b', severity: 'critical', title: 'boom' }]);
  });

  it('does NOT block on salvage from an unparseable judge', () => {
    const r = aggregateBlocks([
      judge('a', {
        status: 'unparseable',
        reason: 'count-mismatch',
        detail: 'declared 2, parsed 1',
        diagnosticBlocks: [{ severity: 'critical', title: 'salvaged' }],
      }),
    ]);
    expect(r.blocked).toBe(false);
    expect(r.hardBlocks).toEqual([]);
    expect(r.diagnosticBlocks).toEqual([{ provider: 'a', severity: 'critical', title: 'salvaged' }]);
    expect(r.unknownJudges).toEqual([
      { provider: 'a', reason: 'count-mismatch', detail: 'declared 2, parsed 1' },
    ]);
  });

  it('keeps duplicate findings from different judges, attributed', () => {
    const same = { severity: 'high' as const, title: 'missing auth' };
    const r = aggregateBlocks([
      judge('a', { status: 'parsed', blocks: [same] }),
      judge('b', { status: 'parsed', blocks: [same] }),
    ]);
    expect(r.hardBlocks).toEqual([
      { provider: 'a', severity: 'high', title: 'missing auth' },
      { provider: 'b', severity: 'high', title: 'missing auth' },
    ]);
  });

  it('orders by judge, then critical before high, then title', () => {
    const r = aggregateBlocks([
      judge('a', {
        status: 'parsed',
        blocks: [
          { severity: 'high', title: 'zebra' },
          { severity: 'high', title: 'apple' },
          { severity: 'critical', title: 'yak' },
        ],
      }),
      judge('b', { status: 'parsed', blocks: [{ severity: 'critical', title: 'aardvark' }] }),
    ]);
    expect(r.hardBlocks.map((b) => `${b.provider}:${b.severity}:${b.title}`)).toEqual([
      'a:critical:yak',
      'a:high:apple',
      'a:high:zebra',
      'b:critical:aardvark',
    ]);
  });

  it('ignores judges that did not succeed', () => {
    const failed: JudgeResult = {
      provider: 'down',
      model: 'm',
      status: 'error',
      error: { message: 'rate limit' },
    };
    const r = aggregateBlocks([failed, judge('a', { status: 'parsed', blocks: [] })]);
    expect(r.unknownJudges).toEqual([]);
    expect(r.blocked).toBe(false);
  });

  it('ignores successful judges with no blockParse (debate or legacy paths)', () => {
    const r = aggregateBlocks([{ provider: 'a', model: 'm', status: 'success', response: 'x' }]);
    expect(r).toEqual({ blocked: false, hardBlocks: [], diagnosticBlocks: [], unknownJudges: [] });
  });
});
