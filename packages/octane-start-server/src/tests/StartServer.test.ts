import { describe, expect, it, vi } from 'vitest'
import { StartServer } from '../StartServer'
import type { AnyRouter } from '@tanstack/router-core'

const { RouterProvider } = vi.hoisted(() => ({
  RouterProvider: () => undefined,
}))

vi.mock('@tanstack/octane-router', () => ({ RouterProvider }))

describe('StartServer', () => {
  it('passes the request router to the Octane router provider', () => {
    const router = {} as AnyRouter
    const element = StartServer({ router })

    expect(element.type).toBe(RouterProvider)
    expect(element.props).toEqual({ router })
  })
})
