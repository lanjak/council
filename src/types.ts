export interface JudgeResult {
  provider: string;
  model: string;
  status: 'success' | 'error' | 'skipped';
  response?: string;
  reasoning?: string;
  error?: { message: string; code?: string };
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
  blockParse?: BlockParse;
}

export type Effort = 'low' | 'medium' | 'high' | 'xhigh';

export interface RunControls {
  /** Per-judge response token cap; overrides provider config when supplied. */
  maxTokens?: number;
  /** Overrides provider effort; omitted from requests if neither is set. */
  effort?: Effort;
}

export interface CouncilRequest extends RunControls {
  prompt: string;
  mode: 'review' | 'plan';
  models: string[];
  systemPrompt?: string;
  blockKey?: string;
}

export interface CouncilOutput {
  prompt: string;
  mode: 'review' | 'plan';
  judges: JudgeResult[];
  synthesis: string;
  availableCount: number;
  totalCount: number;
  warnings?: string[];
  blocked: boolean;
  hardBlocks: AttributedHardBlock[];
  diagnosticBlocks: AttributedHardBlock[];
  unknownJudges: UnknownJudge[];
}

export interface ProviderConfig extends RunControls {
  name: string;
  apiKey: string;
  baseURL: string;
  model?: string;
  displayName: string;
  temperature?: number;
  kind?: 'openai' | 'anthropic';
}

export type Verdict = 'agree' | 'disagree';

export interface DebateTurn extends JudgeResult {
  round: number;
  verdict?: Verdict; // parsed from trailing tag; absent if the turn errored
}

export interface DebateRound {
  round: number;
  turns: DebateTurn[];
}

export interface DebateOutput {
  prompt: string;
  mode: 'debate';
  rounds: DebateRound[]; // always complete, regardless of --full
  consensus: boolean;
  totalRounds: number; // rounds actually run (a partial final round counts)
  maxRounds: number;
  judges: DebateTurn[]; // final turn per participant that survived round 1
  synthesis: string;
  availableCount: number;
  totalCount: number;
  warnings?: string[];
}

export interface DebateSession extends RunControls {
  id: string;
  createdAt: string; // ISO timestamp, drives 24h expiry
  prompt: string; // artifact-expanded text
  models: string[]; // rotation list order; includes 'caller' last
  maxRounds: number;
  turns: DebateTurn[]; // flat, in speaking order
  nextTurn: { round: number; participant: string; order: string[] }; // order is the frozen speaking order for `round`
  warnings?: string[];
}

export type Severity = 'critical' | 'high';

export interface HardBlock {
  severity: Severity;
  rawSeverity?: string; // the judge's original word, when it needed normalising
  title: string;
  location?: string;
}

export type UnparseableReason =
  | 'no-key' // footer key line absent
  | 'no-header' // key present, BLOCKERS: header absent
  | 'bad-header' // header present but the count is neither none/0 nor an integer
  | 'count-mismatch'; // declared count does not equal parsed count

export type BlockParse =
  | { status: 'parsed'; blocks: HardBlock[] }
  | {
      status: 'unparseable';
      reason: UnparseableReason;
      detail?: string;
      diagnosticBlocks: HardBlock[];
    };

export interface AttributedHardBlock extends HardBlock {
  provider: string;
}

export interface UnknownJudge {
  provider: string;
  reason: UnparseableReason;
  detail?: string;
}
