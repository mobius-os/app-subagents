import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test, { mock } from 'node:test'

import {
  ACTIVE_STATUSES,
  FULL_POLL_EVERY,
  RECENT_LIST_LIMIT,
  activePollLimit,
  cancellationMessage,
  createLatestRequest,
  finishedSince,
  groupDelegationsByChat,
  mergePolledWindow,
  startActivePolling,
  watchAppVisibility,
} from '../delegationActivity.js'

test('only the newest detail request may update the expanded task', () => {
  const requests = createLatestRequest()
  const first = requests.begin()
  const second = requests.begin()

  assert.equal(first.signal.aborted, true)
  assert.equal(requests.isCurrent(first.sequence), false)
  assert.equal(requests.isCurrent(second.sequence), true)
})

test('polling detects one active-to-terminal transition', () => {
  assert.equal(finishedSince({ status: 'running' }, { status: 'completed' }), true)
  assert.equal(finishedSince({ status: 'completed' }, { status: 'completed' }), false)
  assert.equal(finishedSince({ status: 'running' }, { status: 'running' }), false)
})

test('stop feedback reflects the returned state', () => {
  assert.equal(cancellationMessage('running'), 'Stop requested')
  assert.equal(cancellationMessage('cancelled'), 'Task stopped')
  assert.equal(cancellationMessage('stopped'), 'Task stopped')
  assert.equal(cancellationMessage('completed'), 'Task had already finished')
})

test('delegation grouping keeps legacy runs separate and groups real chats', () => {
  const rows = [
    { id: 'r1', task_key: 'legacy one', provider: 'codex', status: 'completed' },
    { id: 'r2', task_key: 'legacy two', provider: 'claude', status: 'completed' },
    { id: 'r3', parent_chat_id: 'c1', parent_chat_title: 'Build Atlas', provider: 'codex', model: 'gpt', status: 'running' },
    { id: 'r4', parent_chat_id: 'c1', provider: 'claude', model: 'opus', status: 'completed' },
  ]

  const groups = groupDelegationsByChat(rows)

  assert.deepEqual(groups.map((group) => group.title), [
    'legacy one',
    'legacy two',
    'Build Atlas',
  ])
  assert.equal(groups[2].count, 2)
  assert.equal(groups[2].active, 1)
  assert.deepEqual(groups[2].providers, ['codex', 'claude'])
  assert.deepEqual(groups[2].runs.map((run) => run.id), ['r3', 'r4'])
})

test('compact header uses an inset hairline instead of an edge-to-edge border', () => {
  const source = readFileSync(new URL('../index.jsx', import.meta.url), 'utf8')
  assert.match(source, /\.sa-header-inner::after\s*\{[^}]*inset-inline:\s*16px/s)
  assert.doesNotMatch(source, /\.sa-header(-inner)?\s*\{[^}]*border-bottom/s)
})

test('active polling fetches only the window that reaches the oldest active run', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ id: `d${i}`, status: 'completed' }))
  assert.equal(activePollLimit(rows), 20)
  rows[4].status = 'running'
  assert.equal(activePollLimit(rows), 25)
  rows[140].status = 'paused'
  assert.equal(activePollLimit(rows), 161)
  rows[149].status = 'starting'
  assert.equal(activePollLimit(rows.concat(rows)), RECENT_LIST_LIMIT)
})

test('a polled window updates its rows and keeps older rows without duplicates', () => {
  const previous = [
    { id: 'b', status: 'running' }, { id: 'a', status: 'completed' }, { id: 'old', status: 'failed' },
  ]
  const merged = mergePolledWindow(previous, [
    { id: 'c', status: 'starting' }, { id: 'b', status: 'completed' },
  ], 2)
  assert.deepEqual(merged.map((row) => `${row.id}:${row.status}`), [
    'c:starting', 'b:completed', 'a:completed', 'old:failed',
  ])
  const many = Array.from({ length: RECENT_LIST_LIMIT }, (_, i) => ({ id: `p${i}` }))
  assert.equal(mergePolledWindow(many, [{ id: 'new' }], 1).length, RECENT_LIST_LIMIT)
})

test('a row that vanished inside the polled window is dropped', () => {
  const previous = [{ id: 'c' }, { id: 'gone' }, { id: 'b' }, { id: 'a' }]
  assert.deepEqual(mergePolledWindow(previous, [{ id: 'c' }, { id: 'b' }], 2).map((row) => row.id),
    ['c', 'b', 'a'])
  assert.deepEqual(mergePolledWindow(previous, [{ id: 'c' }], 5).map((row) => row.id), ['c'],
    'a short window is the whole list')
})

test('an open run older than the active window is polled with it', () => {
  const rows = Array.from({ length: 120 }, (_, index) => ({
    id: `d${index}`,
    status: index === 0 ? 'running' : 'completed',
  }))
  assert.equal(activePollLimit(rows), 21)
  assert.equal(activePollLimit(rows, 'd90'), 111)
})

function visibilityHarness() {
  let report = null
  let watching = false
  return {
    watch(onChange) {
      watching = true
      report = onChange
      onChange(true)
      return () => { watching = false }
    },
    set(visible) { report(visible) },
    watching: () => watching,
  }
}

test('active polling reads the whole list periodically, so a reused older helper updates', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const polls = []
    const visibility = visibilityHarness()
    const stop = startActivePolling((full) => { polls.push(full) }, { intervalMs: 1000, watch: visibility.watch })
    for (let i = 0; i < FULL_POLL_EVERY; i += 1) {
      mock.timers.tick(1000)
      await new Promise(setImmediate)
    }
    assert.equal(polls.length, FULL_POLL_EVERY)
    assert.deepEqual(polls.map((full, index) => full ? index + 1 : 0).filter(Boolean), [FULL_POLL_EVERY])
    stop()
    for (let i = 0; i < 10; i += 1) mock.timers.tick(1000)
    assert.equal(polls.length, FULL_POLL_EVERY, 'a stopped poll never runs again')
    assert.equal(visibility.watching(), false)
  } finally {
    mock.timers.reset()
  }
})

test('active polling pauses while the app is hidden and reads everything on return', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const polls = []
    const visibility = visibilityHarness()
    const stop = startActivePolling((full) => { polls.push(full) }, { intervalMs: 1000, watch: visibility.watch })
    mock.timers.tick(1000)
    await new Promise(setImmediate)
    assert.deepEqual(polls, [false])
    visibility.set(false)
    for (let i = 0; i < 60; i += 1) mock.timers.tick(1000)
    assert.deepEqual(polls, [false], 'no polls while hidden')
    visibility.set(true)
    await new Promise(setImmediate)
    assert.deepEqual(polls, [false, true], 'returning reads the whole list at once')
    visibility.set(true)
    assert.equal(polls.length, 2, 'a repeated visible signal does not poll again')
    mock.timers.tick(1000)
    await new Promise(setImmediate)
    assert.deepEqual(polls, [false, true, false])
    stop()
  } finally {
    mock.timers.reset()
  }
})

test('visibility return queues one full refresh behind an unfinished poll', async () => {
  mock.timers.enable({ apis: ['setTimeout'] })
  try {
    let settle
    const polls = []
    const visibility = visibilityHarness()
    const stop = startActivePolling((full) => {
      polls.push(full)
      if (polls.length === 1) return new Promise((resolve) => { settle = resolve })
    }, { intervalMs: 1000, watch: visibility.watch })
    mock.timers.tick(1000)
    visibility.set(false)
    visibility.set(true)
    assert.deepEqual(polls, [false], 'the return does not overlap the pending request')
    settle()
    await new Promise(setImmediate)
    assert.deepEqual(polls, [false, true], 'one full refresh follows the pending request')
    stop()
  } finally {
    mock.timers.reset()
  }
})

test('app visibility follows the Möbius frame signal, else the document', () => {
  const seen = []
  let frameListener = null
  const mobius = {
    runtimeFeatures: { frameVisibility: true },
    onVisibilityChange(cb) { frameListener = cb; cb(false); return () => { frameListener = null } },
  }
  const stopFrame = watchAppVisibility((visible) => seen.push(['frame', visible]), { mobius, doc: { hidden: false } })
  frameListener(true)
  stopFrame()
  assert.equal(frameListener, null)

  const doc = new EventTarget()
  doc.hidden = false
  const stopDoc = watchAppVisibility((visible) => seen.push(['doc', visible]), { mobius: {}, doc })
  doc.hidden = true
  doc.dispatchEvent(new Event('visibilitychange'))
  stopDoc()
  assert.deepEqual(seen, [['frame', false], ['frame', true], ['doc', true], ['doc', false]])
})

test('the delegation list polls through the visibility-aware scheduler', () => {
  const app = readFileSync(new URL('../index.jsx', import.meta.url), 'utf8')
  assert.match(app, /startActivePolling\(pollRecent\)/)
  assert.doesNotMatch(app, /setInterval\(pollRecent/)
})

test('the mounted polling effect discovers an older reused helper before its last active row tears it down', async () => {
  const app = readFileSync(new URL('../index.jsx', import.meta.url), 'utf8')
  const match = app.match(/useEffect\((\(\) => \{\n    if \(!token \|\| !hasActiveRecent\)[\s\S]*?\n  \}), \[token, hasActiveRecent, expanded\]/)
  assert.ok(match, 'exercise the actual polling effect, including its cleanup')
  const rows = Array.from({ length: 100 }, (_, index) => ({ id: `d${index}`, status: index === 0 ? 'running' : 'completed' }))
  const server = rows.map((row) => ({ ...row }))
  server[0].status = 'completed'
  server[60].status = 'running'
  const recentRef = { current: rows }
  const requests = []
  let poll
  let stopped = false
  let cleanup
  const setRecent = (next) => {
    recentRef.current = next
    if (!next.some((row) => ACTIVE_STATUSES.has(row.status))) {
      cleanup?.()
      cleanup = undefined
    }
  }
  const effect = new Function('token', 'hasActiveRecent', 'expanded', 'recentRef', 'setRecent',
    'fetch', 'startActivePolling', 'activePollLimit', 'mergePolledWindow', 'RECENT_LIST_LIMIT',
    'finishedSince', 'loadRunDetail', 'window', 'ACTIVE_STATUSES', `return (${match[1]})`)('token', true, null,
    recentRef, setRecent, async (url) => {
      const limit = Number(new URL(url, 'http://test').searchParams.get('limit'))
      requests.push(limit)
      return { ok: true, json: async () => ({ items: server.slice(0, limit) }) }
    }, (callback) => { poll = callback; return () => { stopped = true } }, activePollLimit,
    mergePolledWindow, RECENT_LIST_LIMIT, finishedSince, () => {}, { mobius: {} }, ACTIVE_STATUSES)
  cleanup = effect()
  await poll(false)
  assert.deepEqual(requests, [21, RECENT_LIST_LIMIT])
  assert.equal(recentRef.current[60].status, 'running')
  assert.equal(stopped, false, 'the effect remains mounted to track the reused helper')
  cleanup()
  assert.equal(stopped, true)
})
