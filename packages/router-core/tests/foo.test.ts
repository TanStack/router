import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute, RouterCore } from '../src'

describe('params extract viz', () => {
  const rootRoute = new BaseRootRoute()

  const order: Array<string> = []
  const args: Record<string, unknown> = {}

  const parseA = vi.fn((params: { a: string }) => {
    order.push('a')
    args.a = { ...params }
    if (params.a !== 'one') throw new Error('Invalid param a')
    return { a: 1 }
  })
  const a = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/$a',
    params: {
      parse: parseA,
    },
  })

  const parseB = vi.fn((params: { b: string }) => {
    order.push('b')
    args.b = { ...params }
    if (params.b !== 'two') throw new Error('Invalid param b')
    return { b: 2 }
  })
  const b = new BaseRoute({
    getParentRoute: () => a,
    path: '/$b',
    params: {
      parse: parseB,
    },
    skipRouteOnParseError: true,
  })
  a.addChildren([b])

  const parseC = vi.fn((params: { c: string }) => {
    order.push('c')
    args.c = { ...params }
    if (params.c !== 'three') throw new Error('Invalid param c')
    return { c: 3 }
  })
  const c = new BaseRoute({
    getParentRoute: () => b,
    path: '/$c',
    params: {
      parse: parseC,
    },
  })
  b.addChildren([c])

  const routeTree = rootRoute.addChildren([a])

  const router = new RouterCore({
    routeTree,
    history: createMemoryHistory(),
  })

  it('should extract params correctly', () => {
    const matches = router.matchRoutes('/one/two/three')

    expect(matches).toHaveLength(4)

    // B is called first, because if's called in the matching phase because of `skipRouteOnParseError`
    expect(order).toEqual(['b', 'a', 'c'])

    // A is called only once
    expect(parseA).toHaveBeenCalledTimes(1)
    // since it's the first, it only gets its own raw params
    expect(args.a).toEqual({ a: 'one' })

    // B is called only once
    expect(parseB).toHaveBeenCalledTimes(1)
    // since it's called in the matching phase, it gets all parent raw params
    expect(args.b).toEqual({ a: 'one', b: 'two' })

    // C is called only once
    expect(parseC).toHaveBeenCalledTimes(1)
    // since it's called last, after the matching phase, it gets parsed parent params, and its own raw param
    expect(args.c).toEqual({ a: 1, b: 2, c: 'three' })

    expect(matches[0]).toEqual(
      expect.objectContaining({
        routeId: '__root__',
        params: { a: 1, b: 2, c: 3 },
        _strictParams: {},
      }),
    )

    expect(matches[1]).toEqual(
      expect.objectContaining({
        routeId: '/$a',
        params: { a: 1, b: 2, c: 3 },
        _strictParams: { a: 1 },
      }),
    )

    expect(matches[2]).toEqual(
      expect.objectContaining({
        routeId: '/$a/$b',
        params: { a: 1, b: 2, c: 3 },
        _strictParams: { a: 1, b: 2 },
      }),
    )

    expect(matches[3]).toEqual(
      expect.objectContaining({
        routeId: '/$a/$b/$c',
        params: { a: 1, b: 2, c: 3 },
        _strictParams: { a: 1, b: 2, c: 3 },
      }),
    )
  })
})
