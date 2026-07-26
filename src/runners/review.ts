import { loadConfig, resolveModels, type CouncilConfig } from '../config.js';
import { runCouncil } from '../council.js';
import { synthesize } from '../chairman.js';
import { buildPrompt } from '../input.js';
import { CouncilError } from '../errors.js';
import { newBlockKey, aggregateBlocks } from '../blocks.js';
import { reviewSystemPrompt } from '../prompts.js';
import type { CouncilOutput } from '../types.js';

export interface ReviewOptions {
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
  });
  const availableCount = judges.filter((j) => j.status === 'success').length;
  if (availableCount === 0) {
    throw new CouncilError('All providers unavailable', 'NO_QUORUM');
  }

  return {
    prompt: prompt.text,
    mode: 'review',
    judges,
    synthesis: synthesize({ prompt: prompt.text, mode: 'review', models, systemPrompt }, judges),
    availableCount,
    totalCount: models.length,
    warnings: prompt.warnings,
    ...aggregateBlocks(judges),
  };
}
