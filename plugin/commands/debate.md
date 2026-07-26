---
description: Run a sequential adversarial debate between LLM judges until consensus
argument-hint: '<prompt> [--models <providers>] [--max-rounds <n>]'
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Run a council debate through the council-axi CLI.

Raw arguments: `$ARGUMENTS`

If the arguments reference a file to debate, attach it with --file instead of
inlining the path into the prompt.

Run:
```bash
node /home/rufi/projects/council-axi/dist/cli.js debate "$ARGUMENTS"
```

Options:

- `--no-participate` - judges only; never pauses for your turn. Use for
  unattended runs where there is no human to take a turn.

By default you are a participant in every debate. When the output ends with
`status: awaiting-caller`, it is your turn: read the transcript, form your
own position, attack the weakest points of the other judges' latest turns,
and continue with the printed `debate turn <session-id> --stdin` command,
ending your turn with `VERDICT: AGREE` or `VERDICT: DISAGREE`. Repeat until
the debate prints a final synthesis.

Return the final output verbatim.
