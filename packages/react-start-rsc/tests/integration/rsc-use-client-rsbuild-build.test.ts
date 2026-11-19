/**
 * Import protection and `'use client'` components a server component
 * renders, in an Rsbuild production build with RSC (SPEC J6.1, J6.3;
 * rsc-use-client-app.ts). In the RSC layer the component is a client
 * reference: its restriction to the client is not judged there. The SSR
 * layer renders it, and judges it there: the server component's module
 * imports it in that layer too (its client reference).
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
    'a client-only-marked component a server component renders works (mock)',
    async () => {
      const { start } = recorder('mock')
      const server = await startRscRsbuildPreviewServer({
        start,
        files: markedApp,
      })
      expect(server.errors).toEqual([])
      await expectCompClicks(await openRscPage(server, '/c'))
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
      // the module itself, in the SSR layer: no edge of the RSC layer's
      // client reference (`./Comp`)
      expect(summary(violations)).toEqual([
        'ssr marker page.tsx -> src/c/Comp.tsx',
      ])
    },
    timeout,
  )
})
