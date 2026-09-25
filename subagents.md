---
name: subagents
description: Read before delegating to a helper agent. Helpers start with the Möbius spawn_agent tool on any connected provider or model; the Subagents app owns provider switches and model/effort defaults.
---

# Delegating to helper agents

Start helpers with the Möbius helper tools (`spawn_agent`, `message_agent`,
`stop_agent`, `list_agents`). The providers' built-in helper tools are off.
Every helper runs as a durable Möbius task: it survives the end of your turn
and planned restarts, shows as a helper row in the chat, and shares a small
per-chat helper process, so helpers are cheap.

## When to delegate

- Bounded work that gains from parallelism, from a different provider or model
  (an independent review, a second opinion), or from isolation.
- For parallel work, call `spawn_agent` several times in the same step.
- Keep small sequential work local; delegation is not a substitute for thinking.

## Start a helper: `spawn_agent`

- `name`: a short stable name such as `review-auth-flow`. Reusing it attaches
  to the same helper instead of starting another.
- `task`: a self-contained contract. The helper does not see this
  conversation, so point to real files rather than pasting context:

  ```text
  Goal: <specific outcome>
  Where: <files, system, or evidence to inspect>
  Constraints: <read-only or exact write scope; important boundaries>
  Done when: <observable result and verification>
  ```

- `access`: `read` forbids file changes; `write` allows edits within the scope
  the task states.
- `provider`, `model`, `effort`: omit them to use this chat's provider and the
  Subagents app's defaults. When the partner names a provider or model, pass
  it; never silently swap. A provider paused in the Subagents app is used only
  when the partner explicitly asks for it (pass it explicitly).

Before starting helpers, say in one short sentence which provider and model
will do what.

## Results

Results arrive in this chat by themselves: during your turn if you are still
working, otherwise by waking the chat after you end it. Never poll, sleep, or
wait on them. Continue independent work, or end your turn.

A helper's result is evidence or a candidate change, not a substitute for your
judgment. Verify its edits and tell the partner which provider did what.

## Follow up, stop, list

- `message_agent`: give a finished helper a follow-up task; it keeps its full
  history. A helper that is still working cannot be messaged: wait for its
  result or stop it.
- `stop_agent`: stop a helper for good, including any command it is running.
- `list_agents`: this chat's helpers and their status; pass one helper to read
  its latest result again.

## Quota and failures

If a helper fails for quota before doing any work and the partner did not name
a provider, start it again on another enabled provider with a
provider-suffixed name. A quota-paused helper resumes by itself at the
provider's reset; when the owner has bought credits or reset usage, retry it
once with `python3 <Subagents source_dir>/subagents.py retry <helper_id>`.

## Older Möbius without these tools

If `spawn_agent` is not among your tools, this Möbius predates them: delegate
with the app's guarded helper instead, `python3 <Subagents source_dir>/subagents.py
run --provider claude|codex --name <key> --scope read|write --background
--prompt-file <path>` (find `source_dir` with `python
"$SCRIPTS_DIR/list_apps.py" --name Subagents --with-source-dir`). Its result
wakes this chat the same way.

## Nesting

Helpers have the same tools and may start their own helpers for bounded
decomposition; a read-only helper may start only read-only helpers. Each
helper returns a concise result to its parent rather than its full history.
