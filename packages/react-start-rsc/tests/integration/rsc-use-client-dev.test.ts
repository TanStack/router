/**
 * Import protection and `'use client'` components a server component
 * renders, on dev servers with RSC (SPEC J6.1, J6.3; rsc-use-client-app.ts).
 * The provider (Vite's `rsc` environment, Rsbuild's RSC layer) compiles the
 * component's module, which the bundler then replaces by client
 * references: its imports are judged where its code runs (SSR, the
 * client), not there. Rsbuild names both layers `ssr`.
 */
import { describe, expect, test } from 'vitest'
import { startRscDevServer, startRscRsbuildDevServer } from './rsc-app'
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
    test.each(['mock', 'error'] as const)(
      "a 'use client' component's .client helper is judged in SSR only (%s)",
      async (behavior) => {
        const { violations, start } = recorder(behavior)
        const page = await devHosts[host](start)
        expect(page.status).toBe(200)
        expect(page.body).toContain('SERVER_ROOT')
        expect(summary(violations)).toEqual([
          'ssr file Comp.tsx -> ./store.client',
        ])
      },
      timeout,
    )
  },
)
