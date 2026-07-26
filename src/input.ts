import { assembleArtifacts, formatArtifactPreamble } from './artifacts.js';

export interface ArtifactInput {
  files?: string[];
  diff?: { range?: string };
  stdinContent?: string;
  capBytes?: number;
}

// Synchronous by design: the library accepts already-read content, so nothing
// here touches process.stdin. The CLI reads stdin and passes stdinContent.
export function buildPrompt(
  prompt: string,
  input: ArtifactInput
): { text: string; warnings: string[] } {
  const bundle = assembleArtifacts({
    files: input.files,
    diff: input.diff,
    stdin: input.stdinContent,
    capBytes: input.capBytes,
  });

  const text = bundle.blocks.length > 0 ? formatArtifactPreamble(bundle) + prompt : prompt;
  return { text, warnings: bundle.warnings };
}

export function parseModelList(csv: string | undefined): string[] | undefined {
  if (csv === undefined) return undefined;
  return csv
    .split(',')
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
}

export function parseCapBytesOverride(): number | undefined {
  const raw = process.env.COUNCIL_MAX_ARTIFACT_BYTES;
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}
