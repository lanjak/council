import { describe, it, expect } from 'vitest';
import { blockFooterInstruction, reviewSystemPrompt, planSystemPrompt } from '../src/prompts.js';
import { parseHardBlocks, KEY_LABEL } from '../src/blocks.js';

const KEY = 'abc12345';

describe('blockFooterInstruction', () => {
  it('embeds the run key', () => {
    expect(blockFooterInstruction(KEY)).toContain(`${KEY_LABEL}: ${KEY}`);
  });

  it('documents both the none and the counted form', () => {
    const text = blockFooterInstruction(KEY);
    expect(text).toContain('BLOCKERS: none');
    expect(text).toContain('BLOCKER:');
  });

  it('contains a worked example that the parser accepts', () => {
    // Guards against the instruction and the parser drifting apart.
    const example = extractExample(blockFooterInstruction(KEY));
    const parsed = parseHardBlocks(example, KEY);
    expect(parsed.status).toBe('parsed');
    expect(parsed.status === 'parsed' && parsed.blocks).toHaveLength(1);
  });
});

describe('system prompts', () => {
  it('review prompt is adversarial and carries the footer instruction', () => {
    const p = reviewSystemPrompt(KEY);
    expect(p.toLowerCase()).toContain('adversarial');
    expect(p).toContain(`${KEY_LABEL}: ${KEY}`);
  });

  it('plan prompt keeps its plan framing and carries the footer instruction', () => {
    const p = planSystemPrompt(KEY);
    expect(p).toContain('plan or decision');
    expect(p).toContain(`${KEY_LABEL}: ${KEY}`);
  });
});

// The example is the fenced region between the two ``` markers.
function extractExample(text: string): string {
  const m = /```\n([\s\S]*?)```/.exec(text);
  if (!m) throw new Error('no fenced example found in the footer instruction');
  return m[1];
}
