import { loadConfig, resolveModels, type CouncilConfig } from '../config.js';
import { runCouncil } from '../council.js';
import { synthesize } from '../chairman.js';
import { buildPrompt } from '../input.js';
import { CouncilError } from '../errors.js';
import { newBlockKey, aggregateBlocks, stripBlockFooter } from '../blocks.js';
import { reviewSystemPrompt } from '../prompts.js';
import type { CouncilOutput, RunControls } from '../types.js';

export interface ReviewOptions extends RunControls {
  prompt: string;
  models?: string[];
  config?: CouncilConfig;
  files?: string[];
  diff?: { range?: string };
  stdinContent?: string;
  capBytes?: number;
}

// Pure: no process.argv, no process.exit, no stdout. Warnings ride on the
// result rather than being printed.
export async function runReview(opts: ReviewOptions): Promise<CouncilOutput> {
  const config = opts.config ?? loadConfig();
  const models = resolveModels(opts.models, config.providers);
  const prompt = buildPrompt(opts.prompt, opts);

  const blockKey = newBlockKey();
  const systemPrompt = reviewSystemPrompt(blockKey);

  const judges = await runCouncil(config, {
    prompt: prompt.text,
    mode: 'review',
    models,
    systemPrompt,
    blockKey,
    maxTokens: opts.maxTokens,
    effort: opts.effort,
  });
  const availableCount = judges.filter((j) => j.status === 'success').length;
  if (availableCount === 0) {
    throw new CouncilError('All providers unavailable', 'NO_QUORUM');
  }

  // The judges array keeps the raw response; only the prose synthesis drops the
  // footer, and only for judges whose footer parsed cleanly.
  const forSynthesis = judges.map((j) =>
    j.blockParse?.status === 'parsed' && j.response !== undefined
      ? { ...j, response: stripBlockFooter(j.response, blockKey) }
      : j
  );

  return {
    prompt: prompt.text,
    mode: 'review',
    judges,
    synthesis: synthesize({ prompt: prompt.text, mode: 'review', models, systemPrompt }, forSynthesis),
    availableCount,
    totalCount: models.length,
    warnings: prompt.warnings,
    ...aggregateBlocks(judges),
  };
}
