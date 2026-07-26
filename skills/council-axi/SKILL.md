---
name: council-axi
description: Run a multi-LLM adversarial review council via the council-axi CLI
metadata:
  type: tool
  user-invocable: false
---

Use this skill when the user wants adversarial feedback on a plan, decision, design, or code change from multiple independent LLMs.

## When to use

- The user asks for a "second opinion", "red team", "pressure test", or "council review".
- The user wants multiple models to review the same artifact.
- The current model should not be the only reviewer.

## How to use

1. Configure providers through environment variables:
   - `COUNCIL_PROVIDERS=openai,groq`
   - `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`
   - `GROQ_API_KEY`, `GROQ_BASE_URL`, `GROQ_MODEL`
   - Any OpenAI-compatible provider works the same way.
2. Run the CLI:
   ```bash
   npx -y council-axi review "<prompt or artifact summary>" --models openai,groq
   ```
3. Return stdout verbatim to the user.

## Debate vs review/plan

`review` and `plan` ask judges independently and in parallel - cheap,
fast, good for breadth of opinion. `debate` makes judges argue with each
other in sequence, round by round, until they converge or hit a round cap -
slower and more expensive (serial calls, growing prompts), but better for
depth on a single contested question. Escalate from `review`/`plan` to
`debate` when the judges disagree or the stakes are high enough to justify
the extra cost.

```bash
npx -y council-axi debate "<prompt>" --models openai,groq
```

Each judge's turn must end with `VERDICT: AGREE` or `VERDICT: DISAGREE`;
consensus requires every active judge to agree on their latest turn. You are
always in the rotation yourself - the command pauses on your turn with a
session id and the exact `debate turn <session-id> --stdin` command to
continue with, and your verdict gates consensus like any judge's. Sessions
expire 24 hours after creation.

## Output format

Review and plan output carries a machine-readable decision alongside the prose:

- `blocked: yes|no` - whether any judge that parsed cleanly reported a hard block
- `blocks[n]{provider,severity,title,location}` - the blocks themselves, attributed
- `diagnostic[n]{...}` - blocks salvaged from a judge whose footer did not parse;
  these never set `blocked`
- `unknown[n]` - judges that answered but could not be parsed, with the reason

Read `blocked` rather than the synthesis prose when you need a decision. Treat a
non-empty `unknown` section as "we do not know", not as "clean".

## Commands

- `npx -y council-axi setup` - check authentication
- `npx -y council-axi review "..."` - adversarial review
- `npx -y council-axi plan "..."` - pressure-test a plan
- `npx -y council-axi debate "..."` - sequential adversarial debate until consensus
