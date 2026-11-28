/**
 * Import protection and `'use client'` components a server component
 * renders, on dev servers with RSC (SPEC J6.1, J6.3; rsc-use-client-app.ts).
 * The provider (Vite's `rsc` environment, Rsbuild's RSC layer) compiles the
 * component's module, which the bundler then replaces by client
 * references: its imports are judged where its code runs (SSR, the
 * client), not there. Rsbuild's RSC layer is the `rsc` environment, as
 * Vite's.
 */
import { describe, expect, test } from 'vitest'
import {
  rscStreams,
  startRscDevServer,
  startRscRsbuildDevServer,
} from './rsc-app'
import { clientHelperApp, recorder, summary } from './rsc-use-client-app'

const timeout = 60_000

/** The page `/c` of a dev server of `clientHelperApp`, per host. */
const devHosts = {
  'Vite dev': async (start: Record<string, unknown>) => {
    const server = await startRscDevServer({
      listen: true,
      start,
      files: clientHelperApp,
    })
    return server.fetch('/c')
  },
  'Rsbuild dev': async (start: Record<string, unknown>) => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      start,
      files: clientHelperApp,
    })
    const response = await fetch(new URL('/c', server.url))
    return { status: response.status, body: await response.text() }
  },
}

describe.each(Object.keys(devHosts) as Array<keyof typeof devHosts>)(
  '%s with RSC',
  (host) => {
    test.for(['mock', 'error'] as const)(
      "a 'use client' component's .client helper is judged in SSR only (%s)",
      { timeout },
      async (behavior) => {
        const { violations, start } = recorder(behavior)
        const page = await devHosts[host](start)
        expect(page.status).toBe(200)
        if (behavior === 'mock') {
          // SSR rendered the server component, `Comp` with the helper's mock
          expect(page.body).toContain('<div data-testid="root">SERVER_ROOT')
        } else {
          // SSR failed on the denied helper and left the page to the
          // client, which renders the server component from the stream
          const fallback = /<template data-msg="([^"]*)"/.exec(page.body)?.[1]
          expect(fallback).toMatch(
            /^Switched to client rendering because the server rendering errored:/,
          )
          expect(fallback).toContain('Import: &quot;./store.client&quot;')
          expect(rscStreams(page.body)).toContainEqual(
            expect.stringContaining('SERVER_ROOT'),
          )
        }
        expect(summary(violations)).toEqual([
          'ssr file Comp.tsx -> ./store.client',
        ])
      },
    )
  },
)
