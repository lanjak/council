---
description: Run a multi-LLM adversarial review of an artifact or question
argument-hint: '<prompt> [--models <providers>]'
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

- `--fail-on-block` - exit 3 when the council reports a hard block
- `--fail-on-unknown` - exit 4 when a judge response could not be parsed
- `--strict` - both of the above

Return stdout verbatim.
