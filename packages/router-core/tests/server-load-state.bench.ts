import { afterAll, bench, describe, expect } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, createControlledPromise } from '../src'
import { createRequestHandler } from '../src/ssr/server'
import { createTestRouter } from './routerTestUtils'

// Apply this identical workload to baseline and candidate. Pending-state
// correctness is covered by tests; baseline must satisfy the shared end state.
const batch = 32

function createFixture(loader: () => unknown, onStay?: () => void) {
  let calls = 0
  const root = new BaseRootRoute({})
  const route = new BaseRoute({
    getParentRoute: () => root,
    path: '/work',
    loader: () => {
      calls++
      return loader()
    },
    onStay,
  })
  const router = createTestRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: ['/work'] }),
    isServer: true,
  })
  return {
    router,
    calls: () => calls,
    dispose: () => router.history.destroy(),
  }
}

function verifyIdle(router: ReturnType<typeof createFixture>['router']) {
  expect(router.state).toMatchObject({ status: 'idle', isLoading: false })
  expect(router.state.location.pathname).toBe('/work')
  expect(router.state.matches.at(-1)).toMatchObject({
    status: 'success',
    loaderData: 'ready',
  })
}

function sequential() {
  const fixture = createFixture(() => 'ready')
  let before = 0
  return {
    async run() {
      before = fixture.calls()
      for (let index = 0; index < batch; index++) {
        await fixture.router.load()
      }
    },
    verify() {
      expect(fixture.calls() - before).toBe(batch)
      verifyIdle(fixture.router)
    },
    dispose: fixture.dispose,
  }
}

function overlapping(first: 0 | 1) {
  let pending: Array<{
    started: ReturnType<typeof createControlledPromise<void>>
    gate: ReturnType<typeof createControlledPromise<string>>
  }> = []
  const fixture = createFixture(() => {
    const current = pending.shift()
    if (!current) {
      throw new Error('Missing overlapping load')
    }
    current.started.resolve()
    return current.gate
  })
  let before = 0
  return {
    async run() {
      before = fixture.calls()
      for (let index = 0; index < batch / 2; index++) {
        const pair = [0, 1].map(() => ({
          started: createControlledPromise<void>(),
          gate: createControlledPromise<string>(),
        }))
        pending = [...pair]
        const loads = [fixture.router.load()]
        await pair[0]!.started
        loads.push(fixture.router.load())
        try {
          await pair[1]!.started
          pair[first]!.gate.resolve('ready')
          await loads[first]
        } finally {
          pair[0]!.gate.resolve('ready')
          pair[1]!.gate.resolve('ready')
          await Promise.all(loads)
        }
      }
    },
    verify() {
      expect(fixture.calls() - before).toBe(batch)
      expect(pending).toHaveLength(0)
      verifyIdle(fixture.router)
    },
    dispose: fixture.dispose,
  }
}

async function throwingLifecycle() {
  const reason = new Error('lifecycle failed')
  const fixture = createFixture(
    () => 'ready',
    () => {
      throw reason
    },
  )
  await fixture.router.load()
  let before = 0
  let rejected = 0
  return {
    async run() {
      before = fixture.calls()
      rejected = 0
      for (let index = 0; index < batch; index++) {
        try {
          await fixture.router.load()
        } catch (error) {
          if (error !== reason) {
            throw error
          }
          rejected++
        }
      }
    },
    verify() {
      expect(rejected).toBe(batch)
      expect(fixture.calls() - before).toBe(batch)
      verifyIdle(fixture.router)
    },
    dispose: fixture.dispose,
  }
}

async function cancelledRequest() {
  let current:
    | {
        started: ReturnType<typeof createControlledPromise<void>>
        gate: ReturnType<typeof createControlledPromise<string>>
      }
    | undefined
  const fixture = createFixture(() => {
    if (!current) {
      return 'ready'
    }
    current.started.resolve()
    return current.gate
  })
  await fixture.router.load()
  const reason = new Error('request disconnected')
  let before = 0
  let rejected = 0
  let rendered = 0
  return {
    async run() {
      before = fixture.calls()
      rejected = 0
      rendered = 0
      for (let index = 0; index < batch / 4; index++) {
        const started = createControlledPromise<void>()
        const gate = createControlledPromise<string>()
        current = { started, gate }
        const controller = new AbortController()
        const cancel = () => gate.reject(reason)
        controller.signal.addEventListener('abort', cancel, { once: true })
        const previousHistory = fixture.router.history
        const loading = createRequestHandler({
          createRouter: () => fixture.router,
          request: new Request('http://localhost/work', {
            signal: controller.signal,
          }),
        })(() => {
          rendered++
          return new Response('ready')
        })
        // Attach rejection consumers before triggering either cancellation.
        const settled = Promise.allSettled([loading, gate])
        try {
          await started
          controller.abort(reason)
          const outcomes = await settled
          for (const outcome of outcomes) {
            if (outcome.status !== 'rejected' || outcome.reason !== reason) {
              throw new Error(
                'Request and loader must reject with cancellation',
              )
            }
          }
          rejected++
        } finally {
          controller.abort(reason)
          await settled
          controller.signal.removeEventListener('abort', cancel)
          previousHistory.destroy()
          current = undefined
        }
      }
    },
    verify() {
      expect(rejected).toBe(batch / 4)
      expect(rendered).toBe(0)
      expect(fixture.calls() - before).toBe(batch / 4)
      expect(current).toBeUndefined()
      verifyIdle(fixture.router)
    },
    dispose: fixture.dispose,
  }
}

const workloads = [
  ['32 sequential same-URL loads', sequential()],
  ['16 overlapping pairs, older first', overlapping(0)],
  ['16 overlapping pairs, newer first', overlapping(1)],
  ['32 throwing lifecycle loads', await throwingLifecycle()],
  ['8 cancelled requests with cooperative loaders', await cancelledRequest()],
] as const
try {
  for (const [, workload] of workloads) {
    await workload.run()
    workload.verify()
  }
} catch (error) {
  for (const [, workload] of workloads) {
    workload.dispose()
  }
  throw error
}

describe('public server load completion', () => {
  for (const [name, workload] of workloads) {
    afterAll(workload.dispose)
    // Preflight above is untimed; teardown checks the final timed batch.
    bench(name, workload.run, {
      time: 1000,
      warmupTime: 200,
      throws: true,
      teardown: workload.verify,
    })
  }
})
