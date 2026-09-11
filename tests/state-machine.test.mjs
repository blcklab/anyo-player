import test from 'node:test'
import assert from 'node:assert/strict'
import { StateMachine } from '../dist/internal/StateMachine.js'
import { AnyoPlayerError } from '../dist/errors.js'

test('state machine accepts the complete desktop, touch, pause, and XR lifecycle', () => {
  const machine = new StateMachine()
  assert.equal(machine.state, 'idle')
  assert.deepEqual(machine.transition('loading'), { previous: 'idle', state: 'loading' })
  assert.deepEqual(machine.transition('ready'), { previous: 'loading', state: 'ready' })
  assert.deepEqual(machine.transition('entering'), { previous: 'ready', state: 'entering' })
  assert.deepEqual(machine.transition('running'), { previous: 'entering', state: 'running' })
  assert.deepEqual(machine.transition('paused'), { previous: 'running', state: 'paused' })
  assert.deepEqual(machine.transition('ready'), { previous: 'paused', state: 'ready' })
  assert.deepEqual(machine.transition('disposing'), { previous: 'ready', state: 'disposing' })
  assert.deepEqual(machine.transition('disposed'), { previous: 'disposing', state: 'disposed' })
})

test('state machine accepts ready and paused world replacement lifecycles', () => {
  const readyReplacement = new StateMachine()
  readyReplacement.transition('loading')
  readyReplacement.transition('ready')
  assert.deepEqual(readyReplacement.transition('replacing'), { previous: 'ready', state: 'replacing' })
  assert.deepEqual(readyReplacement.transition('ready'), { previous: 'replacing', state: 'ready' })

  const pausedReplacement = new StateMachine()
  pausedReplacement.transition('loading')
  pausedReplacement.transition('ready')
  pausedReplacement.transition('paused')
  assert.deepEqual(pausedReplacement.transition('replacing'), { previous: 'paused', state: 'replacing' })
  assert.deepEqual(pausedReplacement.transition('paused'), { previous: 'replacing', state: 'paused' })
})


test('state machine accepts XR entry, active session, exit, and browser-ended recovery', () => {
  const explicit = new StateMachine()
  explicit.transition('loading')
  explicit.transition('ready')
  assert.deepEqual(explicit.transition('vr-entering'), { previous: 'ready', state: 'vr-entering' })
  assert.deepEqual(explicit.transition('vr-active'), { previous: 'vr-entering', state: 'vr-active' })
  assert.deepEqual(explicit.transition('vr-exiting'), { previous: 'vr-active', state: 'vr-exiting' })
  assert.deepEqual(explicit.transition('ready'), { previous: 'vr-exiting', state: 'ready' })

  const browserEnded = new StateMachine()
  browserEnded.transition('loading')
  browserEnded.transition('ready')
  browserEnded.transition('vr-entering')
  browserEnded.transition('vr-active')
  assert.deepEqual(browserEnded.transition('ready'), { previous: 'vr-active', state: 'ready' })
})

test('state machine accepts input cancellation and renderer loss from active states', () => {
  const cancelled = new StateMachine()
  cancelled.transition('loading')
  cancelled.transition('ready')
  cancelled.transition('entering')
  assert.deepEqual(cancelled.transition('ready'), { previous: 'entering', state: 'ready' })

  const rendererLoss = new StateMachine()
  rendererLoss.transition('loading')
  rendererLoss.transition('ready')
  rendererLoss.transition('entering')
  rendererLoss.transition('running')
  assert.deepEqual(rendererLoss.transition('error'), { previous: 'running', state: 'error' })
})

test('state machine accepts initial errors and retry', () => {
  const machine = new StateMachine()
  assert.deepEqual(machine.transition('error'), { previous: 'idle', state: 'error' })
  assert.deepEqual(machine.transition('loading'), { previous: 'error', state: 'loading' })
})

test('state machine rejects invalid transitions', () => {
  const machine = new StateMachine()
  assert.throws(() => machine.transition('running'), error => {
    assert(error instanceof AnyoPlayerError)
    assert.equal(error.code, 'PLAYER_INVALID_STATE')
    return true
  })
})
