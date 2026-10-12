import { renderTOON } from '../output.js';
import { loadConfig, resolveModels, parseRunControls, type RunControlFlags } from '../config.js';
import { parseModelList } from '../input.js';
import { readArtifactInput, type ArtifactOptions } from './review.js';
import { runPlan } from '../runners/plan.js';
import { exitCodeFor, type ExitPolicyOptions } from '../exit.js';

export async function planCommand(
  prompt: string,
  options: { models?: string } & RunControlFlags & ArtifactOptions & ExitPolicyOptions
): Promise<void> {
  // Resolve and validate the model list BEFORE reading stdin. A bad --models
  // must fail immediately rather than after a blocking stdin read drains.
  const controls = parseRunControls(options);
  const config = loadConfig();
  const models = resolveModels(parseModelList(options.models), config.providers);

  const output = await runPlan({
    prompt,
    models,
    config,
    ...controls,
    ...(await readArtifactInput(options)),
  });
  console.log(renderTOON(output));
  process.exitCode = exitCodeFor(output, options);
}
