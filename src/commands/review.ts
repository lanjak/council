import { renderTOON } from '../output.js';
import { CouncilError } from '../errors.js';
import { loadConfig, resolveModels } from '../config.js';
import { parseCapBytesOverride, parseModelList } from '../input.js';
import { readStdinPayload } from '../stdin.js';
import { runReview } from '../runners/review.js';
import { exitCodeFor, type ExitPolicyOptions } from '../exit.js';

export interface ArtifactOptions {
  file?: string[];
  diff?: string | boolean;
  stdin?: boolean;
}

export async function readArtifactInput(options: ArtifactOptions) {
  if (options.stdin && process.stdin.isTTY) {
    throw new CouncilError(
      '--stdin given but stdin is a terminal; pipe content or omit the flag',
      'STDIN_TTY'
    );
  }
  return {
    files: options.file,
    diff:
      options.diff === undefined
        ? undefined
        : { range: typeof options.diff === 'string' ? options.diff : undefined },
    stdinContent: options.stdin ? await readStdinPayload() : undefined,
    capBytes: parseCapBytesOverride(),
  };
}

export async function reviewCommand(
  prompt: string,
  options: { models?: string } & ArtifactOptions & ExitPolicyOptions
): Promise<void> {
  // Resolve and validate the model list BEFORE reading stdin. A bad --models
  // must fail immediately rather than after a blocking stdin read drains.
  const config = loadConfig();
  const models = resolveModels(parseModelList(options.models), config.providers);

  const output = await runReview({
    prompt,
    models,
    config,
    ...(await readArtifactInput(options)),
  });
  console.log(renderTOON(output));
  process.exitCode = exitCodeFor(output, options);
}
