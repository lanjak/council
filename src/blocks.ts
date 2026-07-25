import { randomBytes } from 'node:crypto';
import type { AttributedHardBlock, BlockParse, HardBlock, JudgeResult, Severity, UnknownJudge } from './types.js';

// The reviewed artifact is untrusted input and judges routinely quote it back.
// A per-run key marks where the judge's own footer starts, so quoted artifact
// content can never be read as a verdict. See the spec's threat model for what
// this does not defend against.
export const KEY_LABEL = 'COUNCIL-BLOCKS-KEY';

export function newBlockKey(): string {
  return randomBytes(4).toString('hex');
}

const SEVERITY_MAP: Record<string, Severity> = {
  critical: 'critical',
  blocker: 'critical',
  severe: 'critical',
  high: 'high',
  major: 'high',
};

export function parseHardBlocks(text: string, key: string): BlockParse {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const keyLine = new RegExp(`^\\s*${escapeRegExp(KEY_LABEL)}:\\s*${escapeRegExp(key)}\\s*$`, 'i');

  let keyIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (keyLine.test(lines[i])) {
      keyIdx = i;
      break;
    }
  }
  if (keyIdx === -1) {
    return { status: 'unparseable', reason: 'no-key', diagnosticBlocks: [] };
  }

  const blocks: HardBlock[] = [];
  let headerSeen = false;
  let declared: number | undefined;
  let badHeaderDetail: string | undefined;

  for (const line of lines.slice(keyIdx + 1)) {
    if (!headerSeen) {
      const header = /^\s*BLOCKERS:\s*(.*)$/i.exec(line);
      if (header) {
        headerSeen = true;
        const value = header[1].trim();
        if (/^none$/i.test(value)) declared = 0;
        else if (/^\d+$/.test(value)) declared = Number.parseInt(value, 10);
        else badHeaderDetail = value;
        continue;
      }
    }
    const entry = /^\s*BLOCKER:\s*(.+)$/i.exec(line);
    if (entry) {
      const block = parseBlockLine(entry[1]);
      if (block) blocks.push(block);
    }
  }

  if (!headerSeen) {
    return { status: 'unparseable', reason: 'no-header', diagnosticBlocks: blocks };
  }
  if (declared === undefined) {
    return {
      status: 'unparseable',
      reason: 'bad-header',
      detail: badHeaderDetail,
      diagnosticBlocks: blocks,
    };
  }
  if (declared !== blocks.length) {
    return {
      status: 'unparseable',
      reason: 'count-mismatch',
      detail: `declared ${declared}, parsed ${blocks.length}`,
      diagnosticBlocks: blocks,
    };
  }
  return { status: 'parsed', blocks };
}

// Field splitting is deliberately forgiving: judges write pipes inside titles
// (`use foo | bar instead`), so the last field is taken as the location and
// everything between the severity and it is rejoined as the title.
function parseBlockLine(rest: string): HardBlock | undefined {
  const fields = rest.split('|').map((f) => f.trim());
  if (fields.length < 2) return undefined;

  const rawSeverity = fields[0];
  const severity = normaliseSeverity(rawSeverity);

  let title: string;
  let location: string | undefined;
  if (fields.length === 2) {
    title = fields[1];
  } else {
    location = fields[fields.length - 1];
    title = fields.slice(1, -1).join(' | ');
  }
  if (title.length === 0) return undefined;

  const block: HardBlock = { severity, title };
  if (rawSeverity.toLowerCase() !== severity) block.rawSeverity = rawSeverity;
  if (location !== undefined && location.length > 0) block.location = location;
  return block;
}

// Severity is never checksum-critical. An unrecognised word must not cost the
// whole judge, so it degrades to 'high' with the original preserved.
function normaliseSeverity(raw: string): Severity {
  return SEVERITY_MAP[raw.toLowerCase().replace(/[^a-z]/g, '')] ?? 'high';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface BlockAggregate {
  blocked: boolean;
  hardBlocks: AttributedHardBlock[];
  diagnosticBlocks: AttributedHardBlock[];
  unknownJudges: UnknownJudge[];
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1 };

// Union, never majority: one judge seeing a real problem blocks even if the
// others would talk it down. A safety gate wants the opposite of consensus.
//
// Salvage from an unparseable judge never sets `blocked`, so that signal stays
// honest. The finding is not lost either: it lands in diagnosticBlocks and the
// judge lands in unknownJudges, which a gating consumer already parks on.
export function aggregateBlocks(judges: JudgeResult[]): BlockAggregate {
  const hardBlocks: AttributedHardBlock[] = [];
  const diagnosticBlocks: AttributedHardBlock[] = [];
  const unknownJudges: UnknownJudge[] = [];

  for (const judge of judges) {
    if (judge.status !== 'success' || !judge.blockParse) continue;
    const parse = judge.blockParse;
    if (parse.status === 'parsed') {
      hardBlocks.push(...attribute(judge.provider, parse.blocks));
    } else {
      diagnosticBlocks.push(...attribute(judge.provider, parse.diagnosticBlocks));
      unknownJudges.push({
        provider: judge.provider,
        reason: parse.reason,
        ...(parse.detail === undefined ? {} : { detail: parse.detail }),
      });
    }
  }

  return { blocked: hardBlocks.length > 0, hardBlocks, diagnosticBlocks, unknownJudges };
}

// Judge order is preserved (callers pass judges in configured provider order),
// so sorting within a judge is enough to make the whole list deterministic and
// keep TOON snapshots stable.
function attribute(provider: string, blocks: HardBlock[]): AttributedHardBlock[] {
  return blocks
    .map((b) => ({ ...b, provider }))
    .sort(
      (x, y) => SEVERITY_RANK[x.severity] - SEVERITY_RANK[y.severity] || x.title.localeCompare(y.title)
    );
}
