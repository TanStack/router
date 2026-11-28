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
import {
  expectCompClicks,
  markedApp,
  packageWidgetApp,
  recorder,
  summary,
} from './rsc-use-client-app'
import { openRscPage, startRscRsbuildPreviewServer } from './rsc-app'

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

  // A package's `'use client'` widget that only a server component renders
  // reaches the client through the RSC client reference alone (a module of
  // Rspack's own, with no resource, that no module imports). The client
  // keeps the widget's use of a server-only-marked module: the build must
  // fail at the widget's import, as on Vite. It exited 0 with the mock in
  // the page's chunk (the widget's importers were not known).
  // Source: Astra's and Gemini's reviews of node_modules policy decision 12
  // (`route-rsc-rsbuild-actual`).
  test(
    "a package 'use client' widget a server component renders, using a server-only module, fails the build at the widget (error)",
    async () => {
      const { violations, start } = recorder('error')
      const built = await startRscRsbuildPreviewServer({
        start,
        files: packageWidgetApp,
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(built).toBeInstanceOf(AggregateError)
      expect(summary(violations)).toEqual([
        'client marker widget.jsx -> ./secret.js',
      ])
    },
    timeout,
  )
})
