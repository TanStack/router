/**
 * Import protection and `'use client'` components a server component
 * renders, in an Rsbuild production build with RSC (SPEC J6.1, J6.3;
 * rsc-use-client-app.ts). In the RSC layer (the `rsc` environment) the
 * component is a client reference: none of its code runs there. The
 * server component's import of it brings it to the SSR layer, which
 * renders it: a denied one is reported at that import, in `rsc` (the
 * environment of the file that has it; design-rsc-phase1-graph.md §4,
 * option B).
 */
import { describe, expect, test } from 'vitest'
import { openRscPage, startRscRsbuildPreviewServer } from './rsc-app'
import {
  expectCompClicks,
  markedApp,
  recorder,
  summary,
} from './rsc-use-client-app'

const timeout = 60_000

describe('Rsbuild build with RSC', () => {
  test(
    'a client-only-marked component a server component renders works (mock), its import reported',
    async () => {
      const { violations, start } = recorder('mock')
      const server = await startRscRsbuildPreviewServer({
        start,
        files: markedApp,
      })
      expect(server.errors).toEqual([])
      await expectCompClicks(await openRscPage(server, '/c'))
      expect(summary(violations)).toEqual(['rsc marker page.tsx -> ./Comp'])
    },
    timeout,
  )

  test(
    'a client-only-marked component a server component renders fails the build where SSR renders it (error)',
    async () => {
      const { violations, start } = recorder('error')
      const built = await startRscRsbuildPreviewServer({
        start,
        files: markedApp,
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(built).toBeInstanceOf(AggregateError)
      expect(summary(violations)).toEqual(['rsc marker page.tsx -> ./Comp'])
    },
    timeout,
  )
})
