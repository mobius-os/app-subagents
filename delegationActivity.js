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

// Between periodic full reconciliations, active polls read the newest window. The window reaches just past the
// oldest active row (rows arrive newest-first, so new runs push it down) plus
// headroom for runs started since the last poll.
export const RECENT_LIST_LIMIT = 200
const ACTIVE_POLL_HEADROOM = 20

export function activePollLimit(rows) {
  let oldestActive = -1
  rows.forEach((row, index) => { if (isActive(row.status)) oldestActive = index })
  return Math.min(RECENT_LIST_LIMIT, oldestActive + 1 + ACTIVE_POLL_HEADROOM)
}

// A settled row can be reused for another physical run without moving in the
// created-at ordering. Keep discovery alive even after cached activity ends.
export const FULL_RECONCILE_MS = 60_000

export function createDelegationPollPlan({ now = Date.now } = {}) {
  let lastFullAt = null
  return {
    limit(rows) {
      if (lastFullAt === null || now() - lastFullAt >= FULL_RECONCILE_MS) return RECENT_LIST_LIMIT
      return rows.some(row => isActive(row.status)) ? activePollLimit(rows) : null
    },
    succeeded(limit) {
      if (limit === RECENT_LIST_LIMIT) lastFullAt = now()
    },
  }
}

export function runDetailChanged(before, after) {
  return finishedSince(before, after) || Boolean(before
    && after?.physical_run_id && before.physical_run_id !== after.physical_run_id)
}

// The polled window replaces every row it covers, so a row that disappeared
// from that range disappears here too; rows older than the window keep their
// last known state, and the merged list stays within the full-list bound.
export function mergePolledWindow(previous, windowRows, limit) {
  if (windowRows.length < limit) return windowRows
  const polled = new Set(windowRows.map((row) => row.id))
  const edge = previous.findIndex((row) => row.id === windowRows.at(-1).id)
  const older = edge === -1 ? previous : previous.slice(edge + 1)
  return [
    ...windowRows,
    ...older.filter((row) => !polled.has(row.id)),
  ].slice(0, RECENT_LIST_LIMIT)
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
