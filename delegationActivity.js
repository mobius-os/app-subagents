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
