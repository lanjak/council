import { synthesizeDebate } from '../chairman.js';
import { formatTranscript } from './prompts.js';
import { CALLER } from './loop.js';
import { previewPrompt } from '../output.js';
import type { DebateOutput, DebateRound, DebateTurn } from '../types.js';

export function buildDebateOutput(args: {
  prompt: string;
  turns: DebateTurn[];
  consensus: boolean;
  maxRounds: number;
  totalCount: number;
  warnings?: string[];
}): DebateOutput {
  const rounds: DebateRound[] = [];
  for (const turn of args.turns) {
    let bucket = rounds.find((r) => r.round === turn.round);
    if (!bucket) {
      bucket = { round: turn.round, turns: [] };
      rounds.push(bucket);
    }
    bucket.turns.push(turn);
  }
  rounds.sort((a, b) => a.round - b.round);

  const finalByParticipant = new Map<string, DebateTurn>();
  for (const turn of args.turns) {
    if (turn.status === 'success') finalByParticipant.set(turn.provider, turn);
  }
  const judges = [...finalByParticipant.values()];

  return {
    prompt: args.prompt,
    mode: 'debate',
    rounds,
    consensus: args.consensus,
    totalRounds: rounds.length,
    maxRounds: args.maxRounds,
    judges,
    synthesis: synthesizeDebate({ judges, totalRounds: rounds.length, consensus: args.consensus }),
    availableCount: judges.length,
    totalCount: args.totalCount,
    warnings: args.warnings,
  };
}

export function renderDebateTOON(output: DebateOutput, opts: { full: boolean }): string {
  const lines: string[] = [];
  lines.push(`council[debate]: "${previewPrompt(output.prompt)}"`);
  lines.push(`judges: ${output.availableCount} of ${output.totalCount} responded`);

  lines.push(`rounds[${output.rounds.length}]{round,agree,disagree,active}:`);
  for (const r of output.rounds) {
    const ok = r.turns.filter((t) => t.status === 'success');
    const agree = ok.filter((t) => t.verdict === 'agree').length;
    lines.push(`  ${r.round},${agree},${ok.length - agree},${ok.length}`);
  }

  lines.push(
    output.consensus
      ? `consensus: reached in ${output.totalRounds} of ${output.maxRounds} rounds`
      : `consensus: none after ${output.totalRounds} of ${output.maxRounds} rounds`
  );

  lines.push(`judges[${output.judges.length}]{provider,model,status,verdict}:`);
  for (const j of output.judges) {
    lines.push(`  ${j.provider},${j.model},${j.status},${j.verdict ?? 'unavailable'}`);
  }

  const transcript = formatTranscript(output.rounds.flatMap((r) => r.turns));
  if (!opts.full) {
    lines.push(`transcript: ${output.totalRounds} rounds, ${kb(transcript)} - rerun with --full for complete transcript`);
  }

  if (output.warnings && output.warnings.length > 0) {
    lines.push(`warnings[${output.warnings.length}]:`);
    for (const w of output.warnings) lines.push(`  ${w}`);
  }

  lines.push('synthesis:');
  for (const line of output.synthesis.split('\n')) lines.push(`  ${line}`);

  if (opts.full) {
    lines.push('transcript:');
    for (const line of transcript.split('\n')) lines.push(`  ${line}`);
  }

  // Help lines suggest --models values, so the caller (not a provider) must
  // never appear in them.
  const providers = output.judges.filter((j) => j.provider !== CALLER);
  const help: string[] = [];
  if (output.consensus) {
    help.push(`Run \`npx -y council debate "<prompt>" --models ${providers.map((j) => j.provider).join(',')}\``);
  } else {
    const dissenters = providers.filter((j) => j.verdict !== 'agree').map((j) => j.provider);
    help.push('No consensus - continue with more rounds: rerun with --max-rounds ' + (output.maxRounds + 3));
    if (dissenters.length > 0) {
      help.push(`Or narrow to the dissenters: rerun with --models ${dissenters.join(',')}`);
    }
  }
  lines.push(`help[${help.length}]:`);
  for (const h of help) lines.push(`  ${h}`);

  return lines.join('\n');
}

export function renderDebatePaused(args: {
  sessionId: string;
  round: number;
  maxRounds: number;
  turnIndex: number;
  turnCount: number;
  unseenTurns: DebateTurn[];
  seenRounds: number;
  seenBytes: number;
}): string {
  const lines: string[] = [];
  lines.push(`council[debate]: awaiting your turn`);
  lines.push(`status: awaiting-caller (round ${args.round} of ${args.maxRounds}, turn ${args.turnIndex} of ${args.turnCount})`);
  lines.push(`session: ${args.sessionId}`);
  if (args.seenRounds > 0) {
    lines.push(`seen: ${args.seenRounds} rounds, ${formatKB(args.seenBytes)} - already shown in your previous turn`);
  }
  lines.push('transcript:');
  for (const line of formatTranscript(args.unseenTurns).split('\n')) lines.push(`  ${line}`);
  lines.push('help[2]:');
  lines.push('  It is your turn. Read the transcript above, take a position, attack the');
  lines.push(`  weakest points of the other judges' latest turns, then respond with:`);
  lines.push(`  echo "<your turn, ending with VERDICT: AGREE or VERDICT: DISAGREE>" | npx -y council debate turn ${args.sessionId} --stdin`);
  return lines.join('\n');
}

function kb(text: string): string {
  return formatKB(Buffer.byteLength(text, 'utf8'));
}

function formatKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}
