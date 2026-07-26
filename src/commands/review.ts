import { loadConfig, resolveModels } from '../config.js';
import { runCouncil } from '../council.js';
import { synthesize } from '../chairman.js';
import { renderTOON } from '../output.js';
import { CouncilError } from '../errors.js';
import { buildPrompt, parseCapBytesOverride, parseModelList } from '../input.js';
import { readStdinPayload } from '../stdin.js';

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
  options: { models?: string } & ArtifactOptions
): Promise<void> {
  const config = loadConfig();
  const models = resolveModels(parseModelList(options.models), config.providers);
  const fullPrompt = buildPrompt(prompt, await readArtifactInput(options));

  const judges = await runCouncil(config, { prompt: fullPrompt.text, mode: 'review', models });
  const availableCount = judges.filter((j) => j.status === 'success').length;

  if (availableCount === 0) {
    throw new CouncilError('All providers unavailable', 'NO_QUORUM');
  }

  const synthesis = synthesize({ prompt: fullPrompt.text, mode: 'review', models }, judges);
  const output = {
    prompt: fullPrompt.text,
    mode: 'review' as const,
    judges,
    synthesis,
    availableCount,
    totalCount: models.length,
    warnings: fullPrompt.warnings,
  };

  console.log(renderTOON(output));
}
