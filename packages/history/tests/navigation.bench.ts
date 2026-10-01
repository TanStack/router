import { bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '../src'

const BATCH = 100

describe('history navigation allocations', async () => {
  for (const ignored of [false, true]) {
    const history = createMemoryHistory()
    if (ignored) {
      history.block({ blockerFn: () => true })
    }
    history.replace('/next', undefined, { ignoreBlocker: ignored })
    expect(history.location.pathname).toBe('/next')
    bench(
      ignored ? 'ignored blockers' : 'unblocked replacements',
      () => {
        for (let index = 0; index < BATCH; index++) {
          history.replace('/next', undefined, { ignoreBlocker: ignored })
        }
      },
      { time: 1000, warmupTime: 200, throws: true },
    )
  }

  for (const blocked of [false, true]) {
    const history = createMemoryHistory()
    history.block({ blockerFn: () => blocked })
    history.replace('/next')
    expect(history.location.pathname).toBe('/')
    await Promise.resolve()
    expect(history.location.pathname).toBe(blocked ? '/' : '/next')
    bench(
      blocked ? 'blocked replacements' : 'allowing blockers',
      async () => {
        for (let index = 0; index < BATCH; index++) {
          history.replace('/next')
          await Promise.resolve()
        }
      },
      {
        time: 1000,
        warmupTime: 200,
        throws: true,
        teardown: () => {
          expect(history.location.pathname).toBe(blocked ? '/' : '/next')
        },
      },
    )
  }

  const history = createMemoryHistory()
  const accepted: Array<string> = []
  const blockers: Array<string> = []
  const probe = createMemoryHistory()
  probe.subscribe(({ location }) => accepted.push(location.pathname))
  const removeAllowing = probe.block({
    blockerFn: () => {
      blockers.push('allowing')
      return false
    },
  })
  probe.replace('/allowing')
  await Promise.resolve()
  removeAllowing()
  probe.replace('/unblocked')
  const removeBlocking = probe.block({
    blockerFn: () => {
      blockers.push('blocking')
      return true
    },
  })
  probe.replace('/blocked')
  await Promise.resolve()
  probe.replace('/ignored', undefined, { ignoreBlocker: true })
  removeBlocking()
  expect(accepted).toEqual(['/allowing', '/unblocked', '/ignored'])
  expect(blockers).toEqual(['allowing', 'blocking'])
  probe.destroy()

  let unblock = history.block({ blockerFn: () => false })
  history.replace('/next')
  expect(history.location.pathname).toBe('/')
  await Promise.resolve()
  expect(history.location.pathname).toBe('/next')
  bench(
    'mixed unblocked, blocked and ignored replacements',
    async () => {
      for (let index = 0; index < BATCH; index++) {
        history.replace('/next')
        await Promise.resolve()
        unblock()
        history.replace('/next')
        const remove = history.block({ blockerFn: () => true })
        history.replace('/next')
        await Promise.resolve()
        history.replace('/next', undefined, { ignoreBlocker: true })
        remove()
        unblock = history.block({ blockerFn: () => false })
      }
    },
    { time: 1000, warmupTime: 200, throws: true },
  )
})
