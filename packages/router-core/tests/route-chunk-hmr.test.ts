import { afterEach, describe, expect, it } from 'vitest'
import { applyRouteChunkHmr, applyRouteHmr } from '../src/hmr'
import { fakeRouter, forgetRouters } from './route-hmr-fakes'

describe('applyRouteChunkHmr (dev-only, webpack-style split chunks)', () => {
  afterEach(forgetRouters)

  /** A route module's first evaluation, held by a router under `id`. */
  const held = (id: string, file: string) => {
    const route = { options: { loader: () => null } as Record<string, any> }
    const router = fakeRouter(() => ({ [id]: route }))
    applyRouteHmr(id, route as any, { file }, {})
    return router
  }

  it('records a chunk on its first evaluation and loads the route again on a later one', () => {
    const router = held('/posts', '/src/routes/posts.tsx')
    applyRouteChunkHmr('/src/routes/posts.tsx', 'loader', {})
    expect(router._refreshRoute).not.toHaveBeenCalled()
    // a hot update evaluated the chunk again
    applyRouteChunkHmr('/src/routes/posts.tsx', 'loader', {})
    expect(router._refreshRoute).toHaveBeenCalledTimes(1)
    // another chunk of the same route file is its own evaluation count
    applyRouteChunkHmr('/src/routes/posts.tsx', 'beforeLoad', {})
    expect(router._refreshRoute).toHaveBeenCalledTimes(1)
  })

  it("a route module's evaluation makes its chunks' next evaluations first ones", () => {
    const router = held('/again', '/src/routes/again.tsx')
    applyRouteChunkHmr('/src/routes/again.tsx', 'loader', {})
    applyRouteHmr(
      '/again',
      { options: { loader: () => null } } as any,
      { file: '/src/routes/again.tsx' },
      {},
    )
    router._refreshRoute.mockClear()
    // the chunk the route's load imports again
    applyRouteChunkHmr('/src/routes/again.tsx', 'loader', {})
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })

  it("leaves alone a router whose route of that id is another file's, and one that holds none", () => {
    const router = held('/', '/src/routes/index.tsx')
    // another route file with a route `/` (another router's), no router holds
    applyRouteHmr(
      '/',
      { options: {} } as any,
      { file: '/src/widget/routes/index.tsx' },
      {},
    )
    applyRouteChunkHmr('/src/widget/routes/index.tsx', 'loader', {})
    applyRouteChunkHmr('/src/widget/routes/index.tsx', 'loader', {})
    // a chunk whose route module never evaluated
    applyRouteChunkHmr('/src/routes/other.tsx', 'loader', {})
    applyRouteChunkHmr('/src/routes/other.tsx', 'loader', {})
    expect(router._refreshRoute).not.toHaveBeenCalled()
  })
})
