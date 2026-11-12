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

  it('takes the components a chunk hands over; only a chunk holding a non-component option refreshes the route', () => {
    const _refreshRoute = vi.fn(() => Promise.resolve())
    const take = vi.fn()
    const exportsOf = { component: () => null }
    const adapter = {}
    ;(window as any).__TSR_ROUTER__ = {
      routesById: {
        '/hand': {
          options: { component: { __tsrHot: { take } }, loader: () => null },
        },
      },
      _refreshRoute,
    }
    const handOver = { exports: exportsOf, refresh: false, adapter }
    applyRouteChunkHmr('/hand', 'component', handOver)
    expect(take).not.toHaveBeenCalled()
    applyRouteChunkHmr('/hand', 'component', handOver)
    expect(take).toHaveBeenCalledExactlyOnceWith(exportsOf, adapter)
    expect(_refreshRoute).not.toHaveBeenCalled()

    applyRouteChunkHmr('/hand', 'component~loader', {
      ...handOver,
      refresh: true,
    })
    applyRouteChunkHmr('/hand', 'component~loader', {
      ...handOver,
      refresh: true,
    })
    expect(take).toHaveBeenCalledTimes(2)
    expect(_refreshRoute).toHaveBeenCalledOnce()
  })
})
