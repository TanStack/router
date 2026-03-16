/** @vitest-environment node */

import { runWithStartContext } from '@tanstack/start-storage-context'
import { describe, expect, it } from 'vitest'

import { createMiddleware } from '../src/createMiddleware'
import {
  executeMiddleware,
  flattenMiddlewaresWithDetails,
} from '../src/createServerFn'

describe('createServerFn runtime metadata', () => {
  it('flattens nested middleware with stable subtree positions', () => {
    const mw1 = createMiddleware({ type: 'function' }).server((ctx: any) =>
      ctx.next(),
    )
    const mw2 = createMiddleware({ type: 'function' }).server((ctx: any) =>
      ctx.next(),
    )
    const mw3 = createMiddleware({ type: 'function' })
      .middleware([mw1, mw2])
      .server((ctx: any) => ctx.next())
    const mw4 = createMiddleware({ type: 'function' }).server((ctx: any) =>
      ctx.next(),
    )
    const mw5 = createMiddleware({ type: 'function' })
      .middleware([mw3, mw4])
      .server((ctx: any) => ctx.next())

    const details = flattenMiddlewaresWithDetails([mw5 as any])

    expect(details.map((d) => d.middleware)).toEqual([mw1, mw2, mw3, mw4, mw5])
    expect(details.map((d) => d.position)).toEqual([0, 1, 2, 3, 4])
    expect(details.map((d) => d.subtreeStartPosition)).toEqual([0, 1, 0, 3, 0])
  })

  it('dedupes reused middleware while preserving subtree shape', () => {
    const leaf = createMiddleware({ type: 'function' }).server((ctx: any) =>
      ctx.next(),
    )
    const left = createMiddleware({ type: 'function' })
      .middleware([leaf])
      .server((ctx: any) => ctx.next())
    const right = createMiddleware({ type: 'function' })
      .middleware([leaf])
      .server((ctx: any) => ctx.next())
    const root = createMiddleware({ type: 'function' })
      .middleware([left, right])
      .server((ctx: any) => ctx.next())

    const details = flattenMiddlewaresWithDetails([root as any])

    expect(details.map((d) => d.middleware)).toEqual([leaf, left, right, root])
    expect(details.map((d) => d.subtreeStartPosition)).toEqual([0, 0, 2, 0])
  })

  it('classifies handler when later server middleware is skipped', async () => {
    const sharedServer = createMiddleware({ type: 'function' }).server(
      (ctx: any) => ctx.next(),
    )

    const inspect = createMiddleware({ type: 'function' }).client(
      async ({ next }: any) => next(),
    )

    const details = flattenMiddlewaresWithDetails([
      inspect as any,
      sharedServer as any,
    ])

    const result = await runWithStartContext(
      {
        getRouter: () => {
          throw new Error('not used')
        },
        request: new Request('http://example.com'),
        startOptions: {},
        contextAfterGlobalMiddlewares: {},
        executedRequestMiddlewares: new Set([sharedServer]),
      },
      () =>
        executeMiddleware([inspect as any, sharedServer as any], 'client', {
          method: 'GET',
          data: undefined,
          headers: {},
          sendContext: {},
          context: {},
          serverFnMeta: { id: 'test' } as any,
          _getMiddlewareEntries: () => details as any,
        }),
    )

    expect((result as any).source).toBe('handler')
  })
})
