---
description: Run a multi-LLM adversarial review of an artifact or question
argument-hint: '<prompt> [--models <providers>] [--max-tokens <n>] [--effort <level>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run an adversarial review through the council CLI.

Raw arguments: `$ARGUMENTS`

Run:
```bash
node /home/rufi/projects/council/dist/cli.js review "$ARGUMENTS"
```

Options:

- `--max-tokens <n>` - positive token budget for each judge call. Choose a small
  budget for a finished plan and a large budget for a codebase scan.
- `--effort <level>` - `low`, `medium`, `high`, or `xhigh`. Overrides
  `<PREFIX>_EFFORT`, which overrides `COUNCIL_EFFORT`. If none is set, effort
  is omitted from the request.
- `--fail-on-block` - exit 3 when the council reports a hard block
- `--fail-on-unknown` - exit 4 when a judge response could not be parsed
- `--strict` - both of the above

Return stdout verbatim.
