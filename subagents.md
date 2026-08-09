---
name: subagents
description: Read before delegating a bounded task to Claude or Codex. This capability is owned by the installed Subagents app: honor each provider's live connection and enable state, use its configured model/effort defaults, run through the app's guarded helper, prevent recursive delegation, and report which provider did what.
---

# Delegating to a subagent

The **Subagents** app is the source of truth. Its provider-neutral helper reads
the current app configuration and Möbius's passive provider connection status
at the moment of delegation; do not infer availability from a binary alone and
do not use the old Codex Claude-Code plugin.

## 0. Prefer native in-process agents (the cheap path)

There are two ways to run a subagent, with very different runtime cost:

- **Native in-process agents** — your own SDK's built-in subagent fleet (Claude's
  Task/Workflow agents; Codex's multi-agent). They run *inside this turn's single
  agent process*, so they add **zero new Möbius processes**. This is the default:
  for parallel or bounded work that finishes within the current turn, launch
  native agents and block on them in-turn.
- **A delegated child (this helper)** — a *full separate agent process* with its
  own hidden child chat, session, and event/broadcast buffers. Powerful (it
  survives the turn and can auto-wake you), but under fan-out this is where
  process and memory multiply.

So delegate through this helper **only when the work genuinely needs an
independent, durable child** — it must outlive the turn, needs its own isolated
session/working tree, or you want to close the turn and be woken with the result
later. If native in-process agents can do the job within the turn, use them
instead; do not spawn a delegated child just to parallelize in-turn work.

## 1. Read the live state

Find the installed app named `Subagents` (legacy slug `codex`, current slug
`subagents`) with:

```bash
python "$SCRIPTS_DIR/list_apps.py"
```

Its `source_dir` contains `subagents.py`. Before choosing a provider, run:

```bash
python <source_dir>/subagents.py snapshot
```

The snapshot distinguishes:

- `connected`: durable local credentials are usable;
- `enabled`: the owner's independent app switch;
- `runtime`: the outcome of the most recent real delegated call
  (`available`, `quota_limited`, `auth_error`, `temporarily_unavailable`);
- model and effort defaults for each provider.

Connection does **not** imply enabled. A quota/runtime failure does **not**
erase a valid connection. If a provider is disabled, use it only when the
partner explicitly asks for that provider and pass `--explicit`.

## 2. Choose one provider honestly

- If the partner names Claude or Codex, use that provider or surface why it
  cannot run. Never silently swap providers or models.
- If neither is named, choose only among connected + enabled providers. Pick
  the one that best fits the bounded outcome, or keep the work local when a
  subagent would not materially help.
- If no eligible provider exists, continue without delegation and say why.
- Resolve natural-language model names against the snapshot's model IDs and
  aliases. An unmatched model is a question or an error, never an invented ID.

Before the call, state the provider, model/default, and bounded purpose in one
short sentence. This makes cross-provider compute explicit without adding an
approval ceremony to ordinary authorized work.

## 3. Run through the guarded helper

Put the lean outcome-first prompt in a temporary file, then call:

```bash
python <source_dir>/subagents.py run \
  --provider claude|codex \
  --name <stable-task-key> \
  --scope read|write \
  [--model <exact-id-or-alias>] \
  [--effort <level>] \
  [--explicit] \
  [--background] \
  --prompt-file <path>
```

**Blocking (default) vs `--background`.** Without `--background` the helper waits
inside this turn and prints the child's result inline — use it when you need the
outcome to finish the current turn. With `--background` it submits the durable
child and returns immediately; the child runs on its own and **Möbius auto-wakes
this chat with the result when it finishes**, so the turn can end. Reach for
`--background` **only when the work must genuinely outlive the turn** (long-running,
or you want to close the turn and be pinged with the result later). Each delegated
child — blocking or background — is a full separate agent process (see the cost
note in §0), so it is the expensive path; do not use it as a routine replacement
for native in-process agents. You can reuse the same `--name` in a later turn to
attach and poll a background child early.

The helper:

- checks current connection + enable state again immediately before spending;
- applies the provider's configured model/effort defaults;
- creates one hidden, app-owned child chat whose transcript and SDK session are
  supervised by Möbius like any other durable turn;
- treats `(parent logical run, --name)` as the immutable idempotency key, so
  re-running the exact command after a retry or planned restart ATTACHES to the
  existing child instead of spending twice;
- sets a maximum delegation depth of one and blocks child questions, skills,
  Memory, recent-chat context, and further agent/workflow launches;
- uses a read-only sandbox/permission mode for reviews and a write-capable mode
  only when the current task already authorizes edits;
- blocking mode waits inside this turn while the durable child runs; background
  mode (`--background`) returns at once and relies on the parent auto-wake to
  deliver the result in a later turn; after a platform restart, run the same
  command + task name to reattach (blocking) or let the boot reconcile wake you
  (background);
- leaves spending limits to the owner's provider/account configuration;
- automatically reseeds a lost read-only provider session from the durable
  child history, but stops a lost write session for parent review rather than
  risking duplicate edits;
- records success, quota exhaustion, auth failure, or temporary failure in the
  app's runtime status without hiding the provider's exact error;
- never retries through another provider or model.

Do not invoke `claude -p` or `codex exec` directly when this installed app is
available; the helper is the recursion, configuration, durable identity, and
status boundary. Choose a short semantic task name (for example
`audit-restart-recovery`) and reuse it only for that exact prompt + policy.

## 4. Shape the prompt and verify

Use a compact contract:

```text
Goal: <specific outcome>
Where: <files, system, or evidence to inspect>
Constraints: <read-only or exact write scope; important boundaries>
Done when: <observable result and verification>
```

Point to real files instead of pasting large context. A delegated result is
evidence or a candidate change, not a substitute for your own judgment. Review
its output, verify any edits, and tell the partner which provider did what.

Never voluntarily end a turn while a **blocking** delegated child is still
running. A **background** delegation is the supported way to let the turn end
while work continues: Möbius wakes this chat with the result when the child
finishes (and the boot reconcile wakes you for a child that finished during a
restart), so you don't have to hold the turn open. For a blocking child, a
planned platform restart is the only exception — after recovery, re-run the same
helper command and `--name` to attach to the child the supervisor resumed.
