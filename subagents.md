---
name: subagents
description: Read before delegating a bounded task to Claude or Codex. This capability is owned by the installed Subagents app: honor each provider's live connection and enable state, use its configured model/effort defaults, run through the app's guarded helper, preserve parent tool access, and report which provider did what.
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

Find the installed app named `Subagents` and request the source path explicitly:

```bash
python "$SCRIPTS_DIR/list_apps.py" --name Subagents --with-source-dir
```

Use the `source_dir` from the matching row. Before choosing a provider, run:

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
  (--prompt-file <path> | --prompt '<bounded contract>')
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
- permits useful local decomposition without an artificial recursion ceiling;
  each child sees only its own bounded contract, inherits the parent agent's
  usable local and connected tools, owns its immediate children,
  and reports a concise result upward rather than leaking descendant history;
  owner questions, Memory, and recent-chat context remain blocked; an owner
  question is returned as a blocker for the parent to ask, never parked inside
  the child;
- keeps the requested read/write scope in the provider policy and bounded
  contract without maintaining a second route-by-route tool allowlist;
- survives a platform restart: rerun the same blocking command to reattach, or
  let boot reconciliation wake the parent of a background run;
- does not impose an ordinary Möbius spending budget; provider/account quotas
  remain observable runtime state rather than a hidden local ceiling;
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
Delegated children normally use `--prompt` because confined read mode does not
create temporary files; top-level agents should keep using a prompt file for
longer contracts.

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

Bound reviews by the decision they must change and the smallest authoritative
source set that can answer it. Do not hand one child several independent audit
themes merely because it can inspect a large tree; split genuinely independent
questions or keep the synthesis local. High effort is not a substitute for a
clear stopping condition.

The app shows recent runs, duration, usage, results, and live status. The same
controls are available from the helper when terminal output is more useful:

```bash
python <source_dir>/subagents.py list --limit 12
python <source_dir>/subagents.py status <delegation-id> [--history]
python <source_dir>/subagents.py cancel <delegation-id>
```

Use cancellation only when the task is no longer wanted or is clearly running
away; inspecting status is read-only. The complete child history is retained
for recovery and audit, while the parent should still receive a concise
synthesis rather than a transcript dump.

Do not end a turn while a blocking child runs. Use `--background` when the turn
should end first; after a planned restart, rerun a blocking command with the
same `--name` to attach to its resumed child.
