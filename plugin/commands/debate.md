---
description: Run a sequential adversarial debate between LLM judges until consensus
argument-hint: '<prompt> [--models <providers>] [--max-rounds <n>] [--max-tokens <n>] [--effort <level>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run a council debate through the council CLI.

Raw arguments: `$ARGUMENTS`

If the arguments reference a file to debate, attach it with --file instead of
inlining the path into the prompt.

Run:
```bash
node /home/rufi/projects/council/dist/cli.js debate "$ARGUMENTS"
```

Options:

- `--max-tokens <n>` - positive token budget for each judge call. Choose a small
  budget for a finished plan and a large budget for a codebase scan.
- `--effort <level>` - `low`, `medium`, `high`, or `xhigh`. Overrides
  `<PREFIX>_EFFORT`, which overrides `COUNCIL_EFFORT`. If none is set, effort
  is omitted from the request.
- Set these controls when starting a debate. Paused sessions retain them
  for `debate turn` calls.
- `--no-participate` - judges only; never pauses for your turn. Use for
  unattended runs where there is no human to take a turn.

By default you are a participant in every debate. When the output ends with
`status: awaiting-caller`, it is your turn: read the transcript, form your
own position, attack the weakest points of the other judges' latest turns,
and continue with the printed `debate turn <session-id> --stdin` command,
ending your turn with `VERDICT: AGREE` or `VERDICT: DISAGREE`. Repeat until
the debate prints a final synthesis.

Return the final output verbatim.
