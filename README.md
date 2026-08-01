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
  and runs through `subagents.py`, which enforces a one-hop recursion limit,
  preserves the task's read/write scope, records real runtime outcomes, and
  never silently swaps provider or model. The helper does not impose its own
  monetary budget; provider/account limits remain authoritative.

## Durable state

The app owns two files in its numeric-ID storage:

- `config.json` — `{version, providers.{claude,codex}.{enabled,default_model,default_effort}}`
- `status.json` — the most recent real delegated-call outcome per provider

The UI subscribes to both, so a result recorded by the agent repaints an
already-open app.

## Install lifecycle

`mobius.json` declares `subagents.md` as an app-provided skill. A real packaged
install materializes that skill into the shared agent skill inventory; uninstall
deactivates it and recovery restores it. Local `apply_app.py` intentionally does
not simulate this lifecycle.
