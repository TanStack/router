import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateStart, waitForRouterMatches } from '../hydrateStart'
import type { AnyRouter } from '@tanstack/router-core'

const { coreHydrateStart } = vi.hoisted(() => ({
  coreHydrateStart: vi.fn<() => Promise<AnyRouter>>(),
}))

vi.mock('@tanstack/start-client-core/client', () => ({
  hydrateStart: coreHydrateStart,
}))

type TestMatchesStore = {
  get: () => Array<string>
  subscribe: (listener: () => void) => { unsubscribe: () => void }
  commit: (value: Array<string>, notify?: boolean) => void
  subscriberCount: () => number
}

function createMatchesStore(
  initialValue: Array<string> = [],
): TestMatchesStore {
  let value = initialValue
  const listeners = new Set<() => void>()

  return {
    get: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return {
        unsubscribe: () => listeners.delete(listener),
      }
    },
    commit(nextValue, notify = true) {
      value = nextValue
      if (notify) {
        listeners.forEach((listener) => listener())
      }
    },
    subscriberCount: () => listeners.size,
  }
}

function createRouterWithMatchesStore(store: TestMatchesStore): AnyRouter {
  return {
    stores: {
      matchesId: store,
    },
  } as unknown as AnyRouter
}

describe('Octane Start hydration readiness', () => {
  beforeEach(() => {
    coreHydrateStart.mockReset()
  })

  it('waits for the transitioned match commit before resolving hydration', async () => {
    const store = createMatchesStore()
    const router = createRouterWithMatchesStore(store)
    coreHydrateStart.mockResolvedValue(router)

    let hydrated = false
    const promise = hydrateStart().then((result) => {
      hydrated = true
      return result
    })

    await Promise.resolve()
    await Promise.resolve()

    expect(hydrated).toBe(false)
    expect(store.subscriberCount()).toBe(1)

    store.commit(['__root__'])

    await expect(promise).resolves.toBe(router)
    expect(store.subscriberCount()).toBe(0)
  })

  it('resolves immediately when hydration already committed matches', async () => {
    const store = createMatchesStore(['__root__'])
    const router = createRouterWithMatchesStore(store)

    await expect(waitForRouterMatches(router)).resolves.toBeUndefined()
    expect(store.subscriberCount()).toBe(0)
  })

  it('closes a commit race between the initial read and subscription', async () => {
    const store = createMatchesStore()
    const subscribe = store.subscribe
    store.subscribe = (listener) => {
      store.commit(['__root__'], false)
      return subscribe(listener)
    }
    const router = createRouterWithMatchesStore(store)

    await expect(waitForRouterMatches(router)).resolves.toBeUndefined()
    expect(store.subscriberCount()).toBe(0)
  })
})
