/**
 * Start's Rsbuild plugin on a running dev server honours the app's Start
 * options that shape what the server answers (SPA mode).
 */
import { describe, expect, test } from 'vitest'
import { appFiles, createStartApp, startRsbuildDevServer } from '../start-app'
import type { StartOptions } from '../start-app'

declare global {
  // Counts the runs of the `/` route's loader. Rsbuild's dev server runs
  // the server bundle in the test's process, so its loader sees this global.
  var indexLoaderRuns: number | undefined
}

const timeout = 60_000

/**
 * A dev server of an app whose root route renders "root route" around its
 * `/` route, which renders "index route" and counts its loader's runs.
 */
async function startApp(options: StartOptions = {}) {
  globalThis.indexLoaderRuns = 0
  const app = await createStartApp(
    appFiles({
      'src/routes/__root.tsx': `import { createElement } from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => createElement('main', null, 'root route', createElement(Outlet)),
})
`,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => {
    globalThis.indexLoaderRuns = (globalThis.indexLoaderRuns ?? 0) + 1
  },
  component: () => 'index route',
})
`,
    }),
  )
  return startRsbuildDevServer(app, options)
}

describe('Rsbuild dev server options', () => {
  // Control: without SPA mode, the dev server renders the route (and runs
  // its loader) on the server.
  test(
    'without SPA mode, the dev server renders the route on the server',
    async () => {
      const url = await startApp()
      const html = await (await fetch(url)).text()
      expect(html).toContain('root route')
      expect(html).toContain('index route')
      expect(globalThis.indexLoaderRuns).toBe(1)
    },
    timeout,
  )

  // Bug: with SPA mode, the Rsbuild dev server renders the matched route
  // and runs its loader on the server; Vite's dev server answers the shell.
  // Source: src/rsbuild/plugin.ts (`TSS_SHELL` not defined in dev, unlike
  // src/vite/planning.ts `createViteDefineConfig`).
  // Impact: #8543: an SPA app's loaders run on the dev server (server-only
  // failures, wrong data) though they never do in production.
  test(
    'with SPA mode, the dev server answers the shell without running the loader',
    async () => {
      const url = await startApp({ spa: { enabled: true } })
      const response = await fetch(url)
      expect(response.status).toBe(200)
      // The shell: the root route alone, the matched route left to the client
      const html = await response.text()
      expect(html).toContain('root route')
      expect(html).not.toContain('index route')
      expect(globalThis.indexLoaderRuns).toBe(0)
    },
    timeout,
  )
})
