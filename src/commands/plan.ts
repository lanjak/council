import { loadConfig, resolveModels } from '../config.js';
import { runCouncil } from '../council.js';
import { synthesize } from '../chairman.js';
import { renderTOON } from '../output.js';
import { CouncilError } from '../errors.js';
import { buildPrompt, parseModelList } from '../input.js';
import { readArtifactInput, type ArtifactOptions } from './review.js';

export async function planCommand(
  prompt: string,
  options: { models?: string } & ArtifactOptions
): Promise<void> {
  const config = loadConfig();
  const models = resolveModels(parseModelList(options.models), config.providers);
  const systemPrompt = `You are reviewing a plan or decision. Be adversarial: question assumptions, identify risks, and suggest alternatives. Keep your response concise.`;
  const fullPrompt = buildPrompt(prompt, await readArtifactInput(options));

  const judges = await runCouncil(config, { prompt: fullPrompt.text, mode: 'plan', models, systemPrompt });
  const availableCount = judges.filter((j) => j.status === 'success').length;

  if (availableCount === 0) {
    throw new CouncilError('All providers unavailable', 'NO_QUORUM');
  }

  const synthesis = synthesize({ prompt: fullPrompt.text, mode: 'plan', models, systemPrompt }, judges);
  const output = {
    prompt: fullPrompt.text,
    mode: 'plan' as const,
    judges,
    synthesis,
    availableCount,
    totalCount: models.length,
    warnings: fullPrompt.warnings,
  };

  console.log(renderTOON(output));
}
