export { runReview, type ReviewOptions } from './runners/review.js';
export { runPlan, type PlanOptions } from './runners/plan.js';
export { runDebate, activeParticipants, roundOrder, CALLER, type DebateRunOptions, type DebateProgress } from './debate/loop.js';
export { buildDebateOutput, renderDebateTOON } from './debate/render.js';

export { parseHardBlocks, aggregateBlocks, newBlockKey, KEY_LABEL, type BlockAggregate } from './blocks.js';
export { parseVerdict } from './verdict.js';
export { renderTOON } from './output.js';
export { exitCodeFor, type ExitPolicyOptions } from './exit.js';
export { CouncilError } from './errors.js';

/**
 * UNSTABLE. Configuration is env-var only today and is being reworked as part
 * of the provider config-file work (backlog item 4 / tracker T-015). This
 * export will change shape. Do not depend on it in long-lived code.
 */
export { loadConfig, resolveModels, type CouncilConfig } from './config.js';

export type {
  AttributedHardBlock,
  BlockParse,
  CouncilOutput,
  CouncilRequest,
  DebateOutput,
  DebateRound,
  DebateSession,
  DebateTurn,
  Effort,
  RunControls,
  HardBlock,
  JudgeResult,
  ProviderConfig,
  Severity,
  UnknownJudge,
  UnparseableReason,
  Verdict,
} from './types.js';
