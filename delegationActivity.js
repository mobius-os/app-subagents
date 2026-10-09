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

// The full list is fetched once per open; while runs are active the app polls
// only the newest rows that can still change. The window reaches just past the
// oldest active row, or the open run if that is older (rows arrive
// newest-first, so new runs push it down), plus headroom for runs started
// since the last poll. A finished helper reused for a follow-up runs again at
// its old position, so every FULL_POLL_EVERY-th poll reads the whole list.
export const RECENT_LIST_LIMIT = 200
export const FULL_POLL_EVERY = 12
const ACTIVE_POLL_HEADROOM = 20
const ACTIVE_POLL_MS = 5000

export function activePollLimit(rows, openId = null) {
  let oldest = -1
  rows.forEach((row, index) => { if (isActive(row.status) || row.id === openId) oldest = index })
  return Math.min(RECENT_LIST_LIMIT, oldest + 1 + ACTIVE_POLL_HEADROOM)
}

// Calls onChange(visible) now and whenever the app is shown or hidden. The
// shell keeps hidden app frames loaded with `document.hidden` false, so the
// runtime's frame signal is used where the host provides it.
export function watchAppVisibility(onChange, {
  mobius = globalThis.window?.mobius,
  doc = globalThis.document,
} = {}) {
  if (mobius?.runtimeFeatures?.frameVisibility && typeof mobius.onVisibilityChange === 'function') {
    return mobius.onVisibilityChange((visible) => onChange(visible !== false))
  }
  const report = () => onChange(!doc?.hidden)
  doc?.addEventListener?.('visibilitychange', report)
  report()
  return () => doc?.removeEventListener?.('visibilitychange', report)
}

// Polls after each request settles while visible, never overlaps requests,
// and queues a full refresh on return from a hidden frame. Returns stop().
export function startActivePolling(poll, {
  intervalMs = ACTIVE_POLL_MS,
  fullEvery = FULL_POLL_EVERY,
  watch = watchAppVisibility,
} = {}) {
  let timer = null
  let polls = 0
  let shown = null
  let stopped = false
  let inFlight = false
  let pendingFull = false
  const schedule = () => {
    if (shown && !stopped && !inFlight && !timer) timer = setTimeout(tick, intervalMs)
  }
  const run = (full) => {
    if (inFlight) { pendingFull ||= full; return }
    inFlight = true
    let result
    try { result = poll(full) } catch (error) { result = Promise.reject(error) }
    Promise.resolve(result).catch(() => {}).finally(() => {
      inFlight = false
      if (stopped || !shown) return
      if (pendingFull) {
        pendingFull = false
        run(true)
      } else schedule()
    })
  }
  const tick = () => {
    timer = null
    polls += 1
    run(polls % fullEvery === 0)
  }
  const unwatch = watch((visible) => {
    if (visible === shown) return
    const returning = shown === false
    shown = visible
    clearTimeout(timer)
    timer = null
    if (!visible) return
    if (returning) run(true)
    else schedule()
  })
  return () => {
    stopped = true
    clearTimeout(timer)
    unwatch?.()
  }
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
