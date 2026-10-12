#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { program, CommanderError } from 'commander';
import { reviewCommand } from './commands/review.js';
import { planCommand } from './commands/plan.js';
import { debateCommand, debateTurnCommand, debateAbortCommand } from './commands/debate.js';
import { setupCommand } from './commands/setup.js';
import { homeCommand } from './commands/home.js';
import { hookCommand } from './commands/hook.js';
import { formatError } from './errors.js';

// Read from package.json at runtime rather than hardcoding a copy of the
// version string here - a hardcoded literal silently drifts from
// package.json on every release (it did, on the 0.4.1 release).
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8')) as { version: string };

program
  .name('council')
  .description('Multi-LLM adversarial review council - an AXI')
  .version(pkg.version)
  .exitOverride()
  .configureOutput({
    writeOut: (str: string) => process.stdout.write(str),
    writeErr: () => {},
  });

program
  .command('setup')
  .description('Check provider authentication status')
  .action(setupCommand);

function collect(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

program
  .command('review <prompt>')
  .description('Run an adversarial review of an artifact or question')
  .option('-m, --models <models>', 'Comma-separated provider list')
  .option('--max-tokens <n>', 'Positive per-judge token budget; caller picks per task: small for a finished plan, large for a codebase scan')
  .option('--effort <level>', 'Reasoning effort: low|medium|high|xhigh (overrides env; omitted when unconfigured)')
  .option('-f, --file <path>', 'Attach a file, directory, or cmd:<command> for its stdout (repeatable)', collect, [])
  .option('--diff [range]', 'Attach git diff (default: HEAD)')
  .option('--stdin', 'Attach artifact content from stdin')
  .option('--fail-on-block', 'Exit 3 when the council reports a hard block')
  .option('--fail-on-unknown', 'Exit 4 when a judge response could not be parsed')
  .option('--strict', 'Shorthand for --fail-on-block and --fail-on-unknown')
  .action(reviewCommand);

program
  .command('plan <prompt>')
  .description('Pressure-test a plan or decision')
  .option('-m, --models <models>', 'Comma-separated provider list')
  .option('--max-tokens <n>', 'Positive per-judge token budget; caller picks per task: small for a finished plan, large for a codebase scan')
  .option('--effort <level>', 'Reasoning effort: low|medium|high|xhigh (overrides env; omitted when unconfigured)')
  .option('-f, --file <path>', 'Attach a file, directory, or cmd:<command> for its stdout (repeatable)', collect, [])
  .option('--diff [range]', 'Attach git diff (default: HEAD)')
  .option('--stdin', 'Attach artifact content from stdin')
  .option('--fail-on-block', 'Exit 3 when the council reports a hard block')
  .option('--fail-on-unknown', 'Exit 4 when a judge response could not be parsed')
  .option('--strict', 'Shorthand for --fail-on-block and --fail-on-unknown')
  .action(planCommand);

const debate = program
  .command('debate')
  .description('Run a sequential adversarial debate until consensus or round cap')
  .addHelpText('after', '\nRun options: --max-tokens <n> (positive per-judge budget; small for a finished plan, large for a codebase scan), --effort <level> (low|medium|high|xhigh; default: medium).\nUse council debate run --help for all run options.');

debate
  .command('run <prompt>', { isDefault: true, hidden: true })
  .option('-m, --models <models>', 'Comma-separated provider list')
  .option('--max-tokens <n>', 'Positive per-judge token budget; caller picks per task: small for a finished plan, large for a codebase scan')
  .option('--effort <level>', 'Reasoning effort: low|medium|high|xhigh (overrides env; omitted when unconfigured)')
  .option('--max-rounds <n>', 'Maximum debate rounds (default: 5)')
  .option('--full', 'Include the complete round-by-round transcript')
  .option('--no-participate', 'Judges only; never pause for your turn (for unattended runs)')
  .option('-f, --file <path>', 'Attach a file, directory, or cmd:<command> for its stdout (repeatable)', collect, [])
  .option('--diff [range]', 'Attach git diff (default: HEAD)')
  .option('--stdin', 'Attach artifact content from stdin')
  .action(debateCommand);

debate
  .command('turn <session-id> [response]')
  .description('Submit your turn in a paused participating debate')
  .option('--stdin', 'Read the turn from stdin')
  .option('--full', 'Include the complete transcript in the final output')
  .action(debateTurnCommand);

debate
  .command('abort <session-id>')
  .description('Delete a paused debate session')
  .action(debateAbortCommand);

program
  .command('hook [event]')
  .description('Harness lifecycle hook entrypoint (session-start|post-edit|stop)')
  .option('--payload <json>', 'hook payload as JSON (alternative to stdin)')
  .action(hookCommand);

async function main(): Promise<void> {
  if (process.argv.length <= 2) {
    await homeCommand();
    return;
  }
  await program.parseAsync(process.argv);
}

main().catch((err) => {
  if (err instanceof CommanderError) {
    if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
      process.exit(0);
    }
    console.log(`${err.message.trim()}\nhelp: npx -y @lanjak/council --help`);
    process.exit(2);
  }
  console.log(formatError(err));
  process.exit(1);
});
