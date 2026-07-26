import { renderTOON } from '../output.js';
import { parseModelList } from '../input.js';
import { readArtifactInput, type ArtifactOptions } from './review.js';
import { runPlan } from '../runners/plan.js';

export async function planCommand(
  prompt: string,
  options: { models?: string } & ArtifactOptions
): Promise<void> {
  const output = await runPlan({
    prompt,
    models: parseModelList(options.models),
    ...(await readArtifactInput(options)),
  });
  console.log(renderTOON(output));
}
