import { createMemoryHistory } from '@tanstack/history'
import { afterEach, expect, test, vi } from 'vitest'
import { BaseRootRoute } from '../src'
import { hydrate } from '../src/ssr/client'
import { createTestRouter, dehydrateToBootstrap } from './routerTestUtils'

afterEach(() => vi.unstubAllGlobals())

test('each hydration codec receives fresh arguments with its data and method receiver', async () => {
  const received: Array<object> = []
  const build = (isServer: boolean) => {
    const option = {
      handler: () => ({ ready: true }),
      dehydrate: true as const,
      hydrate(this: unknown, args: { data: { ready: boolean } }) {
        expect(this).toBe(option)
        expect(args.data).toEqual({ ready: true })
        received.push(args)
        Object.freeze(args)
        return args.data
      },
    }
    return createTestRouter({
      routeTree: new BaseRootRoute({
        context: option,
        beforeLoad: option,
        loader: option,
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
      isServer,
    })
  }
  const server = build(true)
  const client = build(false)
  try {
    vi.stubGlobal('window', {
      $_TSR: await dehydrateToBootstrap(server, { routes: {} }),
    })
    await hydrate(client)
    expect(received).toHaveLength(3)
    expect(new Set(received).size).toBe(3)
    expect(client.state.matches[0]).toMatchObject({
      status: 'success',
      context: { ready: true },
      loaderData: { ready: true },
    })
  } finally {
    client.clearCache()
    server.history.destroy()
    client.history.destroy()
  }
})
