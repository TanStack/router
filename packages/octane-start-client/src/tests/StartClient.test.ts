import {
  HYDRATION_RANGE_BOUNDARY,
  createRoot,
  drainPassiveEffects,
  flushSync,
  useEffect,
} from 'octane'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AnyRouter } from '@tanstack/router-core'

afterEach(() => {
  vi.doUnmock('@tanstack/octane-router')
  vi.resetModules()
})

describe('StartClient', () => {
  it('signals router hydration after descendant passive effects', async () => {
    const order: Array<string> = []

    function RouterProvider() {
      useEffect(() => {
        order.push('child')
      }, [])
    }

    vi.doMock('@tanstack/octane-router', () => ({ RouterProvider }))
    const { StartClient } = await import('../StartClient')

    expect(
      (
        StartClient as typeof StartClient & {
          [HYDRATION_RANGE_BOUNDARY]?: string
        }
      )[HYDRATION_RANGE_BOUNDARY],
    ).toBe('passthrough')

    const previousTsr = window.$_TSR
    window.$_TSR = {
      h: () => {
        order.push('router')
      },
    } as typeof window.$_TSR

    const container = document.createElement('div')
    const root = createRoot(container)

    try {
      root.render(StartClient, { router: {} as AnyRouter })
      flushSync(() => {})
      drainPassiveEffects()

      expect(order).toEqual(['child', 'router'])
    } finally {
      root.unmount()
      window.$_TSR = previousTsr
    }
  })
})
