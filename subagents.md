---
name: subagents
description: Read before delegating a bounded task to Claude or Codex. This capability is owned by the installed Subagents app: honor each provider's live connection and enable state, use its configured model/effort defaults, run through the app's guarded helper, prevent recursive delegation, and report which provider did what.
---

# Delegating to a subagent

The **Subagents** app is the source of truth. Its provider-neutral helper reads
the current app configuration and Möbius's passive provider connection status
at the moment of delegation; do not infer availability from a binary alone and
do not use the old Codex Claude-Code plugin.

## 0. Choose the cheapest honest execution path

Use your SDK's native in-process agents for bounded parallel work that finishes
this turn. They share the current process, so launch them and wait in-turn.

This helper starts a separate durable agent process, hidden child chat, and
session. Use it only when work must outlive the turn, needs that isolation, or
should wake this chat after it finishes—not merely to parallelize ordinary work.

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

Without `--background`, the helper waits and prints the result in this turn.
With it, the helper returns after submission and Möbius wakes this chat when the
child finishes. Reuse the same `--name` to attach and poll it early.

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
- survives a platform restart: rerun the same blocking command to reattach, or
  let boot reconciliation wake the parent of a background run;
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

Do not end a turn while a blocking child runs. Use `--background` when the turn
should end first; after a planned restart, rerun a blocking command with the
same `--name` to attach to its resumed child.
