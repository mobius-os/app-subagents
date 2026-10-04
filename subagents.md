---
name: subagents
description: Read before delegating to a helper agent. Helpers start with the Möbius spawn_agent tool on any connected provider or model; the Subagents app owns provider switches and model/effort defaults.
---

# Delegating to helper agents

Read the platform's `delegation` skill for the current helper workflow and
use `spawn_agent`, `message_agent`, `stop_agent`, and `list_agents`.
Subagents supplies provider switches and model/effort preferences; the platform
owns task admission, recovery, results, and peer messaging.

## Settings and scope

Omit provider/model/effort to use the calling turn's settings unless Subagents
has an explicit preference. An explicitly selected different provider uses
its own defaults, not an incompatible model inherited from the parent.
Respect a paused provider; use it only when the partner explicitly requests it.
Never switch providers or duplicate a quota-paused task merely to bypass a
failure. A quota-paused helper resumes by itself at the provider's reset; when
the owner has bought credits or reset usage, retry it once with
`python3 <Subagents source_dir>/subagents.py retry <helper_id>` (it calls
`POST /api/delegations/{id}/retry`).

Helpers use one trusted execution mode. `spawn_agent` has no `access` or
`scope` argument. Put a read-only or exact editing constraint in the task;
it is a work instruction, not a claimed platform-enforced permission.
Owner approval, public-action, and secret safeguards still apply. Helpers may
delegate bounded work under the same task and safeguards.

## Follow-up versus coordination

- `message_agent(helper, message)` starts a follow-up for a finished helper.
  `helper` is its name or helper_id from `spawn_agent`/`list_agents`, not its
  chat ID. A still-working helper is refused rather than interrupted.
- For a decision-changing note to a working helper or another chat, use
  `send_agent_message(recipients, body)` with its peer chat ID (call
  `list_agent_peers` only if that ID is not already known). Keep `next_turn`
  delivery unless the recipient must change its
  current work; a peer note is not owner authority.
- Results arrive automatically. Do not poll, sleep waiting for a result, or
  use ordinary chat-message APIs for agent-to-agent communication.

If a helper tool fails, continue locally and sequentially; never launch a
provider CLI directly. Only on an older Möbius without `spawn_agent`, use the
app's fallback runner: `python3 <Subagents source_dir>/subagents.py run
--provider claude|codex --name <key> --background --prompt-file <path>`.
