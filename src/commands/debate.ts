import { loadConfig, resolveModels } from '../config.js';
import { runDebate, activeParticipants, CALLER } from '../debate/loop.js';
import { buildDebateOutput, renderDebateTOON, renderDebatePaused } from '../debate/render.js';
import { cleanupExpired, newSessionId, saveSession, loadSession, deleteSession } from '../debate/session.js';
import { formatTranscript } from '../debate/prompts.js';
import { parseVerdict } from '../verdict.js';
import { readStdinPayload } from '../stdin.js';
import { CouncilError } from '../errors.js';
import { buildPrompt, parseModelList } from '../input.js';
import { readArtifactInput, type ArtifactOptions } from './review.js';
import type { DebateSession, DebateTurn } from '../types.js';

export interface DebateCommandOptions extends ArtifactOptions {
  models?: string;
  maxRounds?: string;
  full?: boolean;
  participate?: boolean;
}

// 'caller' is a reserved participant name, never a provider key. Filter it
// AFTER resolution so an explicit --models list and a COUNCIL_PROVIDERS
// fallback are both covered - the earlier pre-filter only guarded the
// explicit path.
function parseModels(raw: string | undefined, providers: Parameters<typeof resolveModels>[1]): string[] {
  return resolveModels(parseModelList(raw), providers).filter((m) => m !== CALLER);
}

export async function debateCommand(prompt: string, options: DebateCommandOptions): Promise<void> {
  cleanupExpired();
  const config = loadConfig();
  const models = parseModels(options.models, config.providers);
  if (models.length < 2) {
    throw new CouncilError('A debate needs at least 2 judges; configure more providers or widen --models', 'NO_QUORUM');
  }
  const maxRounds = parseMaxRounds(options.maxRounds);
  const fullPrompt = buildPrompt(prompt, await readArtifactInput(options));

  // The caller participates by default: it authored the prompt, so it sits
  // in the rotation and its verdict gates consensus. --no-participate drops
  // it, which is what makes an unattended run possible.
  const participate = options.participate !== false;

  const progress = await runDebate(config, {
    prompt: fullPrompt.text,
    models,
    participate,
    maxRounds,
  });

  if (progress.status === 'awaiting-caller') {
    const session: DebateSession = {
      id: newSessionId(),
      createdAt: new Date().toISOString(),
      prompt: fullPrompt.text,
      models: [...models, CALLER],
      maxRounds,
      turns: progress.turns,
      nextTurn: progress.nextTurn!,
      warnings: fullPrompt.warnings,
    };
    saveSession(session);
    console.log(renderPause(session));
    return;
  }

  const output = buildDebateOutput({
    prompt: fullPrompt.text,
    turns: progress.turns,
    consensus: progress.status === 'consensus',
    maxRounds,
    totalCount: models.length + (participate ? 1 : 0),
    warnings: fullPrompt.warnings,
  });
  console.log(renderDebateTOON(output, { full: options.full === true }));
}

function renderPause(session: DebateSession): string {
  const callerTurnIndexes = session.turns
    .map((t, i) => (t.provider === CALLER ? i : -1))
    .filter((i) => i >= 0);
  const lastCallerIdx = callerTurnIndexes.length > 0 ? callerTurnIndexes[callerTurnIndexes.length - 1] : -1;
  const seenTurns = session.turns.slice(0, lastCallerIdx + 1);
  const unseenTurns = session.turns.slice(lastCallerIdx + 1);
  const order = session.nextTurn.order;
  return renderDebatePaused({
    sessionId: session.id,
    round: session.nextTurn.round,
    maxRounds: session.maxRounds,
    turnIndex: order.indexOf(CALLER) + 1,
    turnCount: order.length,
    unseenTurns,
    seenRounds: seenTurns.length > 0 ? new Set(seenTurns.map((t) => t.round)).size : 0,
    seenBytes: Buffer.byteLength(formatTranscript(seenTurns), 'utf8'),
  });
}

export async function debateTurnCommand(
  sessionId: string,
  response: string | undefined,
  options: { stdin?: boolean; full?: boolean }
): Promise<void> {
  const text = await readTurnText(response, options.stdin === true);
  const session = loadSession(sessionId);
  if (session.nextTurn.participant !== CALLER) {
    throw new CouncilError(
      `It is not the caller's turn in session ${sessionId}; the state file may be damaged. Run: council-axi debate abort ${sessionId}`,
      'NOT_YOUR_TURN'
    );
  }

  const callerTurn: DebateTurn = {
    round: session.nextTurn.round,
    provider: CALLER,
    model: CALLER,
    status: 'success',
    response: text,
    verdict: parseVerdict(text),
  };
  const turns = [...session.turns, callerTurn];

  const config = loadConfig();
  const judges = session.models.filter((m) => m !== CALLER);
  const next = participantAfterCaller(session, turns);
  const progress = await runDebate(
    config,
    { prompt: session.prompt, models: judges, participate: true, maxRounds: session.maxRounds },
    next ? { turns, nextTurn: next } : { turns, nextTurn: { round: session.maxRounds + 1, participant: CALLER, order: [] } }
  );

  if (progress.status === 'awaiting-caller') {
    const updated: DebateSession = { ...session, turns: progress.turns, nextTurn: progress.nextTurn! };
    saveSession(updated);
    console.log(renderPause(updated));
    return;
  }

  deleteSession(sessionId);
  const output = buildDebateOutput({
    prompt: session.prompt,
    turns: progress.turns,
    consensus: progress.status === 'consensus',
    maxRounds: session.maxRounds,
    totalCount: session.models.length,
    warnings: session.warnings,
  });
  console.log(renderDebateTOON(output, { full: options.full === true }));
}

// The next speaker after the caller's turn: the next still-active,
// not-yet-spoken participant after CALLER in the round's FROZEN order (never
// recomputed - a judge that errored earlier this round must not shift who
// speaks after the caller), or the opener of the next round when the caller
// closed this one (the engine computes that round's order fresh on resume,
// since no turns are recorded for it yet). Returns undefined past maxRounds
// (engine will cap).
function participantAfterCaller(
  session: DebateSession,
  turns: DebateTurn[]
): { round: number; participant: string; order: string[] } | undefined {
  const order = session.nextTurn.order;
  const round = session.nextTurn.round;
  const active = activeParticipants(session.models, turns);
  const idx = order.indexOf(CALLER);
  for (let i = idx + 1; i < order.length; i++) {
    const candidate = order[i];
    if (turns.some((t) => t.round === round && t.provider === candidate)) continue;
    if (!active.includes(candidate)) continue;
    return { round, participant: candidate, order };
  }
  if (round + 1 > session.maxRounds) return undefined;
  return { round: round + 1, participant: CALLER, order: [] };
}

async function readTurnText(response: string | undefined, stdin: boolean): Promise<string> {
  if (stdin === (response !== undefined)) {
    throw new CouncilError('Provide the turn as an argument or via --stdin, not both/neither', 'BAD_ARG');
  }
  if (!stdin) return response as string;
  if (process.stdin.isTTY) {
    throw new CouncilError('--stdin given but stdin is a terminal; pipe content or omit the flag', 'STDIN_TTY');
  }
  return readStdinPayload();
}

export async function debateAbortCommand(sessionId: string): Promise<void> {
  deleteSession(sessionId);
  console.log(`session ${sessionId}: aborted (no-op if it did not exist)`);
}

export function parseMaxRounds(raw: string | undefined): number {
  if (raw === undefined) return 5;
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new CouncilError(`--max-rounds must be a positive integer, got "${raw}"`, 'BAD_ARG');
  }
  const n = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(n) || n < 1) {
    throw new CouncilError(`--max-rounds must be a positive integer, got "${raw}"`, 'BAD_ARG');
  }
  return n;
}
