// Phase 0 compliance spike. Measures how reliably each configured provider
// emits a parseable hard-block footer. Not a test - it makes real API calls.
//
// Run: npx tsx scripts/spike-compliance.ts [runsPerFixture]
import { readFileSync } from 'node:fs';
import { loadConfig } from '../src/config.js';
import { runCouncil } from '../src/council.js';
import { newBlockKey, parseHardBlocks } from '../src/blocks.js';
import { reviewSystemPrompt } from '../src/prompts.js';
import type { UnparseableReason } from '../src/types.js';

const RUNS_PER_FIXTURE = Number.parseInt(process.argv[2] ?? '5', 10);
const THRESHOLD = 0.9;

const FIXTURES = [
  { name: 'clean', path: 'scripts/fixtures/clean-artifact.ts' },
  { name: 'defective', path: 'scripts/fixtures/defective-artifact.ts' },
];

interface Tally {
  total: number;
  parsed: number;
  reasons: Partial<Record<UnparseableReason, number>>;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const models = Object.keys(config.providers);
  if (models.length === 0) throw new Error('No providers configured. Set COUNCIL_PROVIDERS.');

  const tallies = new Map<string, Tally>(
    models.map((m) => [m, { total: 0, parsed: 0, reasons: {} }])
  );

  for (const fixture of FIXTURES) {
    const source = readFileSync(fixture.path, 'utf8');
    for (let run = 1; run <= RUNS_PER_FIXTURE; run++) {
      const key = newBlockKey();
      const judges = await runCouncil(config, {
        prompt: `Review this file.\n\n\`\`\`ts\n${source}\n\`\`\``,
        mode: 'review',
        models,
        systemPrompt: reviewSystemPrompt(key),
      });

      for (const judge of judges) {
        const tally = tallies.get(judge.provider);
        if (!tally || judge.status !== 'success') continue;
        tally.total += 1;
        const parse = parseHardBlocks(judge.response ?? '', key);
        if (parse.status === 'parsed') {
          tally.parsed += 1;
        } else {
          tally.reasons[parse.reason] = (tally.reasons[parse.reason] ?? 0) + 1;
        }
      }
      console.log(`${fixture.name} run ${run}/${RUNS_PER_FIXTURE} done`);
    }
  }

  console.log('\nprovider,total,parsed,rate,failures');
  let failed = false;
  for (const [provider, t] of tallies) {
    const rate = t.total === 0 ? 0 : t.parsed / t.total;
    if (rate < THRESHOLD) failed = true;
    console.log(
      `${provider},${t.total},${t.parsed},${(rate * 100).toFixed(1)}%,${JSON.stringify(t.reasons)}`
    );
  }

  if (failed) {
    console.log(`\nGATE FAILED: at least one provider parsed below ${THRESHOLD * 100}%.`);
    console.log('Iterate blockFooterInstruction() in src/prompts.ts and re-run before continuing.');
    process.exitCode = 1;
    return;
  }
  console.log(`\nGATE PASSED: every provider parsed at or above ${THRESHOLD * 100}%.`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
