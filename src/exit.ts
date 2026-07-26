import type { CouncilOutput } from './types.js';

export interface ExitPolicyOptions {
  failOnBlock?: boolean;
  failOnUnknown?: boolean;
  strict?: boolean;
}

// Exit codes 0 (success), 1 (CouncilError) and 2 (Commander) are already
// taken, so blocks and unknowns claim 3 and 4. Default stays 0 so existing
// scripts are unaffected.
export function exitCodeFor(output: CouncilOutput, options: ExitPolicyOptions): number {
  const onBlock = options.failOnBlock === true || options.strict === true;
  const onUnknown = options.failOnUnknown === true || options.strict === true;

  if (onBlock && output.blocked) return 3;
  if (onUnknown && output.unknownJudges.length > 0) return 4;
  return 0;
}
