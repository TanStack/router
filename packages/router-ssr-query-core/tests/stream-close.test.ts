import { QueryClient, hydrate } from '@tanstack/query-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setupCoreRouterSsrQueryIntegration } from '../src'

vi.mock('@tanstack/query-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/query-core')>()
  return { ...actual, hydrate: vi.fn(actual.hydrate) }
})

describe('setupCoreRouterSsrQueryIntegration', () => {
  beforeEach(() => {
    vi.mocked(hydrate).mockClear()
  })

  it('does not hydrate once the query stream is closed', async () => {
    const queryClient = new QueryClient()
    const router = { isServer: false, options: {} } as {
      isServer: boolean
      options: { hydrate?: (dehydrated: any) => unknown | Promise<unknown> }
    }

    setupCoreRouterSsrQueryIntegration({ router: router as any, queryClient })

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ mutations: [], queries: [] })
        controller.close()
      },
    })

    await router.options.hydrate?.({ queryStream: stream })
    await vi.waitFor(() => expect(hydrate).toHaveBeenCalled())

    expect(
      vi.mocked(hydrate).mock.calls.some(([, state]) => state === undefined),
    ).toBe(false)
  })
})
