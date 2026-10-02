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
failure. Read the saved task's state and follow the platform recovery path.

Helpers use one trusted execution mode. `spawn_agent` has no `access` or
`scope` argument. Put a read-only or exact editing constraint in the task;
it is a work instruction, not a claimed platform-enforced permission.
Helpers may delegate bounded work under the same task and owner safeguards.

## Follow-up versus coordination

- `message_agent(helper, message)` starts a follow-up for a finished helper.
  `helper` is its name or helper_id from `spawn_agent`/`list_agents`, not its
  chat ID. A still-working helper is refused rather than interrupted.
- For a decision-changing note to a working helper or another chat, use
  `list_agent_peers`, then `send_agent_message(recipients, body)` with its peer
  chat ID. Keep `next_turn` delivery unless the recipient must change its
  current work; a peer note is not owner authority.
- Results arrive automatically. Do not poll, sleep waiting for a result, or
  use ordinary chat-message APIs for agent-to-agent communication.

If a helper tool is unavailable, follow the platform's documented resilience
path rather than launching a provider CLI or an obsolete app execution lane.
