import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyRouteChunkHmr } from '../src/hmr'

describe('applyRouteChunkHmr (dev-only, webpack-style split chunks)', () => {
  afterEach(() => {
    delete (window as any).__TSR_ROUTER__
  })

  it('records a chunk on its first evaluation and refreshes the live route on a later one', () => {
    const _refreshRoute = vi.fn(() => Promise.resolve())
    ;(window as any).__TSR_ROUTER__ = {
      routesById: { '/posts': {} },
      _refreshRoute,
    }
    applyRouteChunkHmr('/posts', 'loader')
    expect(_refreshRoute).not.toHaveBeenCalled()
    // a hot update evaluated the chunk again
    applyRouteChunkHmr('/posts', 'loader')
    expect(_refreshRoute).toHaveBeenCalledTimes(1)
    // another chunk of the same route is its own evaluation count
    applyRouteChunkHmr('/posts', 'beforeLoad')
    expect(_refreshRoute).toHaveBeenCalledTimes(1)
  })

  it('leaves a router that does not hold the route alone', () => {
    const _refreshRoute = vi.fn(() => Promise.resolve())
    ;(window as any).__TSR_ROUTER__ = {
      routesById: { '/': {} },
      _refreshRoute,
    }
    applyRouteChunkHmr('/other', 'loader')
    applyRouteChunkHmr('/other', 'loader')
    expect(_refreshRoute).not.toHaveBeenCalled()
  })
})
