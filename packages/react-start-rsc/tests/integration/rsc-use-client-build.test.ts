/**
 * Import protection and `'use client'` components a server component
 * renders, in a Vite production build with RSC (SPEC J6.1, J6.3;
 * rsc-use-client-app.ts). In the `rsc` environment the component is a
 * client reference: none of its code runs there, and its own imports are
 * not judged there. The server component's import of it brings it to SSR,
 * which renders it: a denied one is reported at that import, in `rsc`
 * (the environment of the file that has it; design-rsc-phase1-graph.md
 * §4, option B).
 */
import { describe, expect, test } from 'vitest'
import {
  clientFileApp,
  expectCompClicks,
  markedApp,
  npmClientOnlyApp,
  recorder,
  summary,
} from './rsc-use-client-app'
import { openRscPage, startRscPreviewServer } from './rsc-app'

const timeout = 60_000

describe('Vite build with RSC', () => {
  test.for([
    ['client-only-marked', markedApp, 'rsc marker page.tsx -> ./Comp'],
    ['.client', clientFileApp, 'rsc file page.tsx -> ./Comp.client'],
  ] as const)(
    'a %s component a server component renders works (mock), its import reported',
    { timeout },
    async ([_, files, reported]) => {
      const { violations, start } = recorder('mock')
      const server = await startRscPreviewServer({ start, files })
      await expectCompClicks(await openRscPage(server, '/c'))
      expect(summary(violations)).toEqual([reported])
    },
  )

  test(
    "a 'use client' component importing React's client-only package builds and works",
    async () => {
      const { start } = recorder('error')
      const server = await startRscPreviewServer({
        start,
        files: npmClientOnlyApp,
      })
      await expectCompClicks(await openRscPage(server, '/c'))
    },
    timeout,
  )

  // SSR renders the component, which the server component's import brings
  // (its importer there is plugin-rsc's client-reference module)
  test(
    'a client-only-marked component a server component renders fails the build where SSR renders it (error)',
    async () => {
      const { violations, start } = recorder('error')
      const built = await startRscPreviewServer({
        start,
        files: markedApp,
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(built).toBeInstanceOf(Error)
      expect(summary(violations)).toEqual(['rsc marker page.tsx -> ./Comp'])
    },
    timeout,
  )
})
