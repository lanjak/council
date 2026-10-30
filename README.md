<h1 align="center">council</h1>

<p align="center">Multi-LLM adversarial review council - an <a href="https://github.com/kunchenguid/axi">AXI</a>.</p>

---

`council` sends a single prompt to several independent LLM judges and returns a synthesized review. It is useful when you want more than one model to look at a plan, decision, or code change before you act. Output is in [TOON](https://toonformat.dev/) so agents can read it cheaply.

It is provider-agnostic. If a provider speaks the OpenAI chat completions API, you can add it to your council by setting a few environment variables.

## Install

```sh
npm install -g @lanjak/council
```

Or run without installing:

```sh
npx -y @lanjak/council <command>
```

## Configure providers

Pick a short key for each provider, then set `COUNCIL_PROVIDERS` plus per-provider env vars.

For example, with OpenAI and Groq:

```sh
export COUNCIL_PROVIDERS="openai,groq"

export OPENAI_API_KEY="sk-..."
export OPENAI_BASE_URL="https://api.openai.com/v1"
export OPENAI_MODEL="gpt-4o"
export OPENAI_DISPLAY_NAME="OpenAI"

export GROQ_API_KEY="gsk_..."
export GROQ_BASE_URL="https://api.groq.com/openai/v1"
export GROQ_MODEL="llama-3.1-70b-versatile"
export GROQ_DISPLAY_NAME="Groq"
```

Required for each provider:

- `<KEY>_API_KEY` - the provider API key
- `<KEY>_BASE_URL` - the OpenAI-compatible base URL
- `<KEY>_MODEL` - the model ID to call

Optional:

- `<KEY>_DISPLAY_NAME` - human-readable name shown in output (defaults to the key)
- `<KEY>_MAX_TOKENS` - response token cap per call (defaults to 32768 for
  OpenAI-compatible providers and 8192 for Anthropic providers)
- `<KEY>_EFFORT` - reasoning effort: `low`, `medium`, `high`, or `xhigh`;
  overrides `COUNCIL_EFFORT` when set
- `<KEY>_TEMPERATURE` - sampling temperature; when unset the field is omitted
  entirely and the provider's own default applies (some endpoints reject any
  explicit value - Kimi's k3 only accepts 1)
- `<KEY>_KIND` - `openai` (default) or `anthropic`. Selects the wire
  protocol spoken to `<KEY>_BASE_URL`. For `anthropic`, `<KEY>_BASE_URL` is
  optional (defaults to `https://api.anthropic.com`) and, when set, is the
  API root - not a full `/v1/messages` path. Note Anthropic's `temperature`
  range is 0-1, unlike OpenAI-compatible's 0-2; a value above 1 copied from
  an existing OpenAI-style entry will fail at request time.

### Per-task token budget and reasoning effort

The calling agent should choose `--max-tokens <n>` for each task. Use a small
budget for reviewing a finished plan and a large budget for scanning a codebase.
The value must be a positive integer. It applies to every judge call in `review`,
`plan`, or `debate` and overrides `<PREFIX>_MAX_TOKENS`.

```sh
council plan "Review this finished plan" --file plan.md --max-tokens 4096
council review "Scan this codebase" --file src --max-tokens 32768 --effort high
council debate "Choose an approach" --max-tokens 8192 --effort medium --no-participate
```

Reasoning effort accepts `low`, `medium`, `high`, or `xhigh`. Precedence is
`--effort`, then `<PREFIX>_EFFORT`, then `COUNCIL_EFFORT`. With nothing configured,
the request omits effort. Set `COUNCIL_EFFORT=medium` to use medium effort by default.
Invalid configured levels fail at config load. OpenAI-compatible requests send
`reasoning_effort`; Anthropic requests send `output_config.effort`. The model
and endpoint must support the selected level. Paused debates retain per-run
controls when resumed.

New state is written under `$XDG_STATE_HOME/council` (default:
`~/.local/state/council`). Debate sessions use its `debates/` subdirectory.
Session loading checks `council` first, then falls back to `council-axi` if
the new session file is absent. Hook edit tracking reads both locations.
Session deletion and expiry cleanup cover both locations.
Environment variable names stay the same.

### Example providers

These are not built in. Add the ones you have keys for.

**OpenAI**

```sh
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o
```

**Moonshot Kimi**

```sh
KIMI_API_KEY=sk-...
KIMI_BASE_URL=https://api.moonshot.ai/v1
KIMI_MODEL=kimi-k3
```

**DeepSeek**

```sh
DEEPSEEK_API_KEY=sk-...
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1
DEEPSEEK_MODEL=deepseek-chat
```

**Xiaomi MiMo**

```sh
MIMO_API_KEY=sk-...
MIMO_BASE_URL=https://api.xiaomimimo.com/v1
MIMO_MODEL=mimo-v2.5-pro
```

**Groq**

```sh
GROQ_API_KEY=gsk_...
GROQ_BASE_URL=https://api.groq.com/openai/v1
GROQ_MODEL=llama-3.1-70b-versatile
```

**Local LM Studio / Ollama / vLLM**

Anything with an OpenAI-compatible endpoint works:

```sh
LOCAL_API_KEY=not-needed
LOCAL_BASE_URL=http://localhost:1234/v1
LOCAL_MODEL=local-model
```

**Anthropic (Claude)**

```sh
CLAUDE_KIND=anthropic
CLAUDE_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-opus-5
```

## Usage

Check which providers are authenticated:

```sh
$ council setup
providers[2]{name,authenticated,detail}:
  openai,true,OpenAI API key is set
  groq,true,Groq API key is set
help[2]:
  Set COUNCIL_PROVIDERS and per-provider env vars to add judges
  Example: COUNCIL_PROVIDERS=openai OPENAI_API_KEY=sk-... OPENAI_BASE_URL=https://api.openai.com/v1 OPENAI_MODEL=gpt-4o
```

Run an adversarial review:

```sh
$ council review "Should we add a caching layer here?"
```

Or pick a subset:

```sh
$ council review "Should we add a caching layer here?" --models openai,groq
```

Pressure-test a plan:

```sh
$ council plan "Should we migrate auth to a separate service?"
```

Attach files, a directory, or a diff:

```sh
$ council review "is this sound?" --file plan.md --file src/
$ council review "what did I break?" --diff
$ git diff | council review "check this" --stdin
```

Example output:

```
council[review]: "Should we add a caching layer here?"
judges: 2 of 2 responded
judges[2]{provider,model,status,verdict}:
  openai,gpt-4o,success,Ship after adding cache invalidation
  groq,llama-3.1-70b-versatile,success,Ship but measure hit ratio first
synthesis:
  ## Council review synthesis (2 judges)

  ### openai (gpt-4o)
  Ship after adding cache invalidation.

  ### groq (llama-3.1-70b-versatile)
  Ship but measure hit ratio first.

  **Key points:**
  - Ship after adding cache invalidation
  - Ship but measure hit ratio first
help[1]: Run `npx -y @lanjak/council review "<prompt>" --models openai,groq`
```

## Usage telemetry (optional)

Telemetry is off unless you set `OTEL_EXPORTER_OTLP_ENDPOINT` or `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`. Set `OTEL_SDK_DISABLED=true` to disable both log export and the `traceparent` header.

When enabled, council sends a W3C `traceparent` header to OpenAI-compatible and Anthropic providers, with one trace per run and one span per model call. After each call, it exports one OTLP/HTTP JSON log record with context only: trace and span IDs, role (`judge` or `debate`), requested model, device (hostname), outcome (`ok`, `error`, `timeout` or `rate_limited`) and duration. It never exports prompt or response text, token counts or cost. The gateway owns token and cost reporting.

Council appends `/v1/logs` to `OTEL_EXPORTER_OTLP_ENDPOINT`. If set, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` takes precedence and is used as the complete URL. Export headers come from `OTEL_EXPORTER_OTLP_HEADERS`; resource attributes come from `OTEL_RESOURCE_ATTRIBUTES`. Both accept comma-separated `key=value` pairs with percent-encoded values.

Exports run in the background with a 1.5-second timeout per request. Model calls do not wait for exports, and export failures do not fail a run. Before exit, the CLI waits once for pending exports, for at most 1.5 seconds total. Library calls return without waiting for exports; an immediate process exit can discard pending records.

## Library usage

council is importable as an ESM library, so a programmatic consumer never
has to shell out or parse stdout.

```ts
import { runReview } from '@lanjak/council';

const result = await runReview({
  prompt: 'Review this change',
  diff: { range: 'main...HEAD' },
  maxTokens: 8192,
  effort: 'medium',
});

if (result.blocked) {
  for (const b of result.hardBlocks) {
    console.error(`${b.provider}: [${b.severity}] ${b.title} ${b.location ?? ''}`);
  }
}
```

### Deciding whether to gate

Three orthogonal signals, so you choose your own policy:

| Field | Meaning |
|---|---|
| `blocked` | A judge we could read cleanly reported at least one hard block |
| `unknownJudges` | A judge answered, but its footer could not be parsed |
| `availableCount < totalCount` | A provider was unreachable |

`blocked` never inflates from salvage. A judge whose footer was truncated lands
in `unknownJudges`, and whatever blocks survived land in `diagnosticBlocks`.

A strict gate treats all three as reasons to stop:

```ts
if (result.blocked || result.unknownJudges.length > 0 ||
    result.availableCount < result.totalCount) {
  parkForHuman();
}
```

`loadConfig` is exported but **unstable**: configuration is being reworked and
its shape will change.

`runReview`, `runPlan`, and `runDebate` accept the exported `RunControls`
fields: `maxTokens` (a number) and `effort` (the exported `Effort` type).
These fields override each provider's configuration. When omitted, provider
settings and token defaults apply; effort is omitted if unconfigured.
For library debates, pass these controls in `DebateRunOptions` on each call,
including calls that resume a debate.

## Debate mode

`review` and `plan` ask judges independently, in parallel, and synthesize the
disagreement for you to resolve. `debate` instead makes judges argue with
each other in sequence, round by round, until they converge on a verdict or
a round cap is hit. Reach for it when a `review` comes back split and you
want the judges to actually confront each other's reasoning instead of you
mediating.

Each round, judges speak in turn and each sees every prior turn's full
response before writing their own. Judges rotate through the same order each
round. A debate needs at least 2 judges (`NO_QUORUM` otherwise).

By default you are a participant: the caller sits in the rotation as one more
judge, is attacked like one, and its verdict gates consensus like everyone
else's. The command pauses when your turn comes up and tells you exactly how
to continue (see "Taking your turn" below). Pass `--no-participate` for a
judges-only debate that runs to consensus or the round cap without ever
pausing - use it for unattended runs and from the library, where there is no
human to take a turn.

```sh
$ council debate "Should we add a caching layer here?" --models openai,groq
```

Options for `debate "<prompt>"` (same artifact flags as `review`/`plan`):

- `-m, --models <models>` - comma-separated provider list
- `--max-rounds <n>` - maximum debate rounds (default: 5)
- `--max-tokens <n>` - positive token budget for each judge call
- `--effort <level>` - `low`, `medium`, `high`, or `xhigh`; overrides env settings
- `--full` - include the complete round-by-round transcript in the output
- `-f, --file <path>` - attach a file or directory (repeatable)
- `--diff [range]` - attach git diff (default: HEAD)
- `--stdin` - attach artifact content from stdin
- `--no-participate` - judges only; never pauses for your turn. Use for
  unattended runs where there is no human to take a turn.

### Verdict tags

Every judge turn must end with a verdict line:

```
VERDICT: AGREE
VERDICT: DISAGREE
```

The tag can follow any amount of free-form reasoning, is matched
case-insensitively, and only the last matching line in a turn counts.
Consensus is reached when every active participant's latest verdict is
`AGREE`. A turn with no verdict tag counts as `DISAGREE` - the debate fails
safe toward continuing rather than toward a false consensus.

### Taking your turn

The debate runs the other judges' turns normally, then pauses on your turn
and prints a session id plus the exact command to continue with:

```sh
$ council debate "Should we add a caching layer here?" --models openai,groq
council[debate]: awaiting your turn
status: awaiting-caller (round 1 of 5, turn 3 of 3)
session: dbt-a1b2c3
transcript:
  ...
help[2]:
  It is your turn. Read the transcript above, take a position, attack the
  weakest points of the other judges' latest turns, then respond with:
  echo "<your turn, ending with VERDICT: AGREE or VERDICT: DISAGREE>" | npx -y @lanjak/council debate turn dbt-a1b2c3 --stdin

$ echo "I agree the cache adds complexity but the hit ratio data supports it.
VERDICT: AGREE" | council debate turn dbt-a1b2c3 --stdin
council[debate]: "Should we add a caching layer here?"
judges: 3 of 3 responded
...
consensus: reached in 1 of 5 rounds
...
```

If the round is not yet resolved, `debate turn` pauses again with a new
transcript slice (only turns you have not seen) and the same session id; run
it again until the final synthesis prints. Sessions are stored under the XDG
state directory and expire 24 hours after creation - an expired or unknown
session id fails with `SESSION_NOT_FOUND`.

### Session commands

`debate turn <session-id> ["<response>"] [--stdin] [--full]` submits your
turn in a paused debate. Provide the response as either a positional
argument or via `--stdin`, never both or neither. Like judge turns, your
response must end with `VERDICT: AGREE` or `VERDICT: DISAGREE`.

`debate abort <session-id>` deletes a paused session. It is idempotent - it
is not an error to abort a session that has already finished or expired.

### Cost

Debate calls are serial, not parallel: each turn waits on the previous one,
and every turn's prompt carries the full transcript so far, so later rounds
cost more per call than earlier ones. `--max-rounds` (default 5) is the main
lever for keeping cost bounded - lower it for cheap exploratory debates,
raise it for questions worth grinding on.

## Attaching artifacts

```sh
council review "is this sound?" --file plan.md --file src/
council review "what did I break?" --diff            # git diff HEAD
council review "review this range" --diff HEAD~3
git diff | council review "check this" --stdin
```

Files and directories are embedded in the prompt with path labels (remote
judges have no filesystem access). Directories respect `.gitignore` files at
or below the attached path (a repo-root `.gitignore` above the attached
directory is not consulted); `node_modules`/`.git` are always skipped; binary
files are skipped with a
warning. The combined artifact budget defaults to 400 KB - explicit `--file`
inputs first, then the diff, then directory expansions; anything past the cap
is truncated or omitted and named in the output's `warnings` section. Override
with `COUNCIL_MAX_ARTIFACT_BYTES`.

A `--file` value prefixed `cmd:` runs the rest as a shell command and attaches
its stdout as an artifact block - for content with no physical file at all
(a doc stored in a database, fetched through its own CLI, say), so you don't
need to write it to a temp file first just to pass `--file` a path:

```sh
council review "..." --file 'cmd:my-notes-tool page get "Projects/x/spec.md"'
```

A failing command is a warning, not a fatal error - the run continues with
whatever other artifacts were given. Empty output produces no block. The
command runs in the same directory `--file`/`--diff` resolve relative paths
against.

### Hard blocks

Judges end their review with a machine-readable footer, so a consumer never has
to read the prose to find out whether something blocks:

```
COUNCIL-BLOCKS-KEY: 7f3c2a91
BLOCKERS: 2
BLOCKER: critical | no auth check on the admin route | src/api.ts:42
BLOCKER: high | unsanitized input reaches the query builder | src/db.ts:88
```

A clean review emits `BLOCKERS: none`. The key line is generated per run - see
[Security](#security).

Everything in `hardBlocks` blocks by definition. Severity (`critical` or `high`)
ranks urgency for a human reader and never gates, so you never have to pick a
threshold. Non-blocking nits stay in the prose.

If a judge answers but its footer cannot be read, it is reported under
`unknown` rather than being guessed at in either direction.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | `CouncilError` |
| 2 | Bad CLI usage |
| 3 | Hard block found (only with `--fail-on-block` or `--strict`) |
| 4 | Unparseable judge (only with `--fail-on-unknown` or `--strict`) |

## Security

Judges tag their hard-block footer with a per-run key so that artifact content
quoted back in a response is never mistaken for a verdict. The key is generated
fresh for every run.

This defends against a reviewed artifact accidentally or naively spoofing a
verdict. It does not defend against a deliberate prompt injection that instructs
the judge to emit the key. Treat results over untrusted third-party code as
advisory.

## Agent integration

`council` ships with an installable Agent Skill in `skills/council/SKILL.md`. Copy it into your agent's skill directory, or point your agent at the CLI directly:

```sh
npx -y @lanjak/council review "..." --models openai,groq
```

## Harness hooks

`council hook <event>` is a portable lifecycle entrypoint any agent
harness can call. It reads the harness's JSON payload from stdin (or
`--payload '<json>'`), best-effort, and never hard-fails on unknown shapes.

- `council hook session-start` - prints available providers and usage as
  context. Always exits 0.
- `council hook post-edit` - records edited file paths for the session.
  Always exits 0. Harnesses must wait for this command's exit before firing
  `stop`.
- `council hook stop` - review gate. If edits are pending, the council
  reviews `git diff HEAD` for those paths. Majority-fail verdict blocks with
  exit 2 and the synthesis on stdout. Anything else exits 0; provider outages
  fail open (edits kept for manual re-review).

Claude Code / openclaude wiring (`~/.claude/settings.json`):

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "council hook session-start" }] }
    ],
    "PostToolUse": [
      { "matcher": "Edit|Write|MultiEdit",
        "hooks": [{ "type": "command", "command": "council hook post-edit" }] }
    ],
    "Stop": [
      { "hooks": [{ "type": "command", "command": "council hook stop" }] }
    ]
  }
}
```

Other harnesses (pi, opencode, codex, Gemini CLI, goose): point their
session-start / after-edit / stop lifecycle events at the same three commands.
What a harness does with hook stdout and exit codes varies - consult its docs.
Payload formats are parsed best-effort; if your harness's shape is not
recognized, the hooks degrade gracefully (session tracking falls back to a
cwd-based key with a stderr warning).

## Development

```sh
npm install
npm test          # vitest
npm run build     # tsc -> dist
npm run dev -- review "..." --models openai
```

## License

[MIT](LICENSE)
