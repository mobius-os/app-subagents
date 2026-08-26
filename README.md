# Subagents

One optional control surface for delegating bounded work to **Claude** and
**Codex** from Möbius.

- **Truthful connection state** comes from Möbius's passive provider-status
  contract. A quota failure never masquerades as a disconnected account.
- **Independent activation** keeps both providers off on a fresh install.
  Upgrading the legacy Codex app preserves its existing effective Codex choice
  while adding Claude as opt-in.
- **Provider-specific defaults** expose the live model registry and compatible
  effort levels without rewriting protected CLI configuration.
- **One provider-neutral skill** reads the current settings at delegation time
  and runs through `subagents.py`, which preserves direct-child ownership and
  the task's read/write scope without an artificial recursion ceiling, records
  real runtime outcomes, and never silently swaps provider or model.
- **Durable child tasks** are hidden app-owned chats supervised by Möbius's
  ordinary SDK/session/restart machinery. A stable task name attaches retries
  and post-restart parents to the same child rather than spending twice.
- **Conservative recovery** may reseed lost read-only sessions from retained
  child history, while lost write sessions stop for review. Möbius records
  provider usage and quota outcomes but does not impose an ordinary local
  spending budget.
- **Visible operations** show recent task status, duration, token usage, and
  results in the app, with a deliberate two-step stop control for active work.
  The helper exposes the same list, status/history, and cancellation boundary.

## Durable state

The app owns two files in its numeric-ID storage:

- `config.json` — `{version, providers.{claude,codex}.{enabled,default_model,default_effort}}`
- `status.json` — the most recent real delegated-call outcome per provider

The UI subscribes to both, so a result recorded by the agent repaints an
already-open app.

Delegation intent and complete child transcripts live in Möbius's relational
chat store. They are retained indefinitely unless the owner deliberately
removes the underlying data; the app does not run an automatic cleanup job.

## Install lifecycle

`mobius.json` declares `subagents.md` as an app-provided skill. A real packaged
install materializes that skill into the shared agent skill inventory; uninstall
deactivates it and recovery restores it. Local `apply_app.py` intentionally does
not simulate this lifecycle.

Version 0.4.4 changes the package identity to `subagents`. Its `previous_id` is
`codex` so that one package migration adopts existing installations in place,
including their numeric app identity, settings, durable child chats, and
app-scoped storage. Runtime discovery uses the installed source tree rather than
carrying either package name as a fallback.
