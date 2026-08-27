import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  cancellationMessage,
  createLatestRequest,
  finishedSince,
  groupDelegationsByChat,
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
