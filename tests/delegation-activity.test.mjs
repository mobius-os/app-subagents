import assert from 'node:assert/strict'
import test from 'node:test'

import {
  cancellationMessage,
  createLatestRequest,
  finishedSince,
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
