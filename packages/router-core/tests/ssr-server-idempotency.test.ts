import { describe, expect, it, vi } from 'vitest'

vi.mock('seroval', async (importOriginal) => {
  const actual = await importOriginal<typeof import('seroval')>()

  return {
    ...actual,
    crossSerializeStream: (_value: unknown, options: any) => {
      options.onDone()
      options.onError?.(new Error('forced duplicate completion'))
    },
    getCrossReferenceHeader: () => '',
  }
})

import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'

describe('ssr-server serialization completion idempotency', () => {
  it('emits onSerializationFinished only once when serializer signals done then error', async () => {
    const emit = vi.fn()
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    const router = {
      options: {
        ssr: {},
        dehydrate: async () => undefined,
      },
      state: {
        matches: [],
      },
      isShell: () => false,
      emit,
    } as any

    attachRouterServerSsrUtils({ router, manifest: undefined })

    let listenerCalls = 0
    router.serverSsr.onSerializationFinished(() => {
      listenerCalls++
    })

    await router.serverSsr.dehydrate()

    const serializationEmits = emit.mock.calls.filter(
      ([event]) => event?.type === 'onSerializationFinished',
    )

    expect(listenerCalls).toBe(1)
    expect(serializationEmits).toHaveLength(1)
    expect(router.serverSsr.isSerializationFinished()).toBe(true)

    consoleErrorSpy.mockRestore()
  })

  it('does not clear render-finished listeners when serialization completes first', async () => {
    const router = {
      options: {
        ssr: {},
        dehydrate: async () => undefined,
      },
      state: {
        matches: [],
      },
      isShell: () => false,
      emit: vi.fn(),
    } as any

    attachRouterServerSsrUtils({ router, manifest: undefined })

    let called = false
    router.serverSsr.onRenderFinished(() => {
      called = true
    })

    await router.serverSsr.dehydrate()
    router.serverSsr.setRenderFinished()

    expect(called).toBe(true)
  })
})
