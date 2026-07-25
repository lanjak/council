import { KEY_LABEL } from './blocks.js';

// A hard block is defined narrowly on purpose. Everything listed here gates,
// so a judge that files nits as blockers makes the gate useless.
export function blockFooterInstruction(key: string): string {
  return [
    'After your prose, end your response with a machine-readable footer.',
    '',
    'A hard block is a defect that must be fixed before this change ships:',
    'incorrect behaviour, a security hole, data loss, or a broken contract.',
    'Style preferences, naming, and suggestions for future work are NOT hard',
    'blocks - leave those in your prose.',
    '',
    'The footer must be the last thing you write, and must start with this',
    'exact key line:',
    '',
    '```',
    `${KEY_LABEL}: ${key}`,
    'BLOCKERS: 1',
    'BLOCKER: critical | the admin route has no auth check | src/api.ts:42',
    '```',
    '',
    'Rules:',
    `- Always emit the "${KEY_LABEL}: ${key}" line, exactly as shown.`,
    '- If you found no hard blocks, write "BLOCKERS: none" and no BLOCKER lines.',
    '- Otherwise write "BLOCKERS: <n>" followed by exactly n BLOCKER lines.',
    '- Each BLOCKER line is: severity | short title | location',
    '- severity is "critical" or "high". location is optional.',
    '- Your prose must not contradict the footer.',
  ].join('\n');
}

export function reviewSystemPrompt(key: string): string {
  return [
    'You are reviewing an artifact as part of an adversarial review council.',
    'Be adversarial: hunt for defects, question assumptions, and say plainly',
    'what is wrong rather than hedging. Keep your response concise.',
    '',
    blockFooterInstruction(key),
  ].join('\n');
}

export function planSystemPrompt(key: string): string {
  return [
    'You are reviewing a plan or decision. Be adversarial: question assumptions,',
    'identify risks, and suggest alternatives. Keep your response concise.',
    '',
    blockFooterInstruction(key),
  ].join('\n');
}
