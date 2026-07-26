import { renderTOON } from '../output.js';
import { loadConfig, resolveModels } from '../config.js';
import { parseModelList } from '../input.js';
import { readArtifactInput, type ArtifactOptions } from './review.js';
import { runPlan } from '../runners/plan.js';

export async function planCommand(
  prompt: string,
  options: { models?: string } & ArtifactOptions
): Promise<void> {
  // Resolve and validate the model list BEFORE reading stdin. A bad --models
  // must fail immediately rather than after a blocking stdin read drains.
  const config = loadConfig();
  const models = resolveModels(parseModelList(options.models), config.providers);

  const output = await runPlan({
    prompt,
    models,
    config,
    ...(await readArtifactInput(options)),
  });
  console.log(renderTOON(output));
}
