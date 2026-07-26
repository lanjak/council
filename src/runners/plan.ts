import { loadConfig, resolveModels, type CouncilConfig } from '../config.js';
import { runCouncil } from '../council.js';
import { synthesize } from '../chairman.js';
import { buildPrompt } from '../input.js';
import { CouncilError } from '../errors.js';
import { newBlockKey, aggregateBlocks, stripBlockFooter } from '../blocks.js';
import { planSystemPrompt } from '../prompts.js';
import type { CouncilOutput } from '../types.js';

export interface PlanOptions {
  prompt: string;
  models?: string[];
  config?: CouncilConfig;
  files?: string[];
  diff?: { range?: string };
  stdinContent?: string;
  capBytes?: number;
}

export async function runPlan(opts: PlanOptions): Promise<CouncilOutput> {
  const config = opts.config ?? loadConfig();
  const models = resolveModels(opts.models, config.providers);
  const prompt = buildPrompt(opts.prompt, opts);
  const blockKey = newBlockKey();
  const systemPrompt = planSystemPrompt(blockKey);

  const judges = await runCouncil(config, {
    prompt: prompt.text,
    mode: 'plan',
    models,
    systemPrompt,
    blockKey,
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
    mode: 'plan',
    judges,
    synthesis: synthesize({ prompt: prompt.text, mode: 'plan', models, systemPrompt }, forSynthesis),
    availableCount,
    totalCount: models.length,
    warnings: prompt.warnings,
    ...aggregateBlocks(judges),
  };
}
