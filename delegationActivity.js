export const ACTIVE_STATUSES = new Set(['starting', 'running', 'resuming', 'paused'])

export function isActive(status) {
  return ACTIVE_STATUSES.has(status)
}

export function finishedSince(before, after) {
  return Boolean(before && after && isActive(before.status) && !isActive(after.status))
}

export function cancellationMessage(status) {
  if (isActive(status)) return 'Stop requested'
  if (status === 'cancelled' || status === 'stopped') return 'Task stopped'
  return 'Task had already finished'
}

export function createLatestRequest() {
  let sequence = 0
  let controller = null
  return {
    begin() {
      controller?.abort()
      controller = new AbortController()
      sequence += 1
      return { sequence, signal: controller.signal }
    },
    isCurrent(candidate) {
      return sequence === candidate
    },
    abort() {
      controller?.abort()
      sequence += 1
    },
  }
}

// Rows arrive newest-first. Preserve first-seen chat order and run order while
// keeping pre-parent-id legacy rows separate from one another.
export function groupDelegationsByChat(rows) {
  const order = []
  const byChat = new Map()
  for (const row of rows) {
    const id = row.parent_chat_id || `legacy-run:${row.id}`
    let group = byChat.get(id)
    if (!group) {
      group = {
        chatId: id,
        title: null,
        providers: new Set(),
        models: new Set(),
        active: 0,
        runs: [],
      }
      byChat.set(id, group)
      order.push(id)
    }
    if (!group.title && row.parent_chat_title) group.title = row.parent_chat_title
    if (row.provider) group.providers.add(row.provider)
    if (row.model) group.models.add(row.model)
    if (ACTIVE_STATUSES.has(row.status)) group.active += 1
    group.runs.push(row)
  }
  return order.map((id) => {
    const group = byChat.get(id)
    return {
      chatId: id,
      title: group.title || group.runs[0]?.task_key || `Chat ${id.slice(0, 8)}…`,
      providers: [...group.providers],
      models: [...group.models],
      active: group.active,
      count: group.runs.length,
      runs: group.runs,
    }
  })
}
