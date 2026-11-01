/**
 * Start's Rsbuild plugin on a running dev server honours the app's Start and
 * Rsbuild options that shape what the server answers (SPA mode, response
 * compression).
 */
import { describe, expect, test } from 'vitest'
import { pluginReact } from '@rsbuild/plugin-react'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import {
  rootDocument,
  routerFile,
  startPageEntries,
} from '../start-compose-app'
import type { RsbuildConfig } from '@rsbuild/core'
import type { TanStackStartRsbuildInputConfig } from '../../../src/rsbuild/schema'

const timeout = 30_000

/** A dev server of an app whose `/` route tells where its loader ran. */
function startApp(
  options: {
    start?: TanStackStartRsbuildInputConfig
    config?: RsbuildConfig
  } = {},
) {
  return startRsbuildStartDevServer({
    browser: true,
    hmr: false,
    start: options.start,
    config: { ...options.config, plugins: [pluginReact()] },
    files: {
      ...startPageEntries,
      'src/ssr-entry.ts': `export { getRouter } from './router'`,
      'src/client-entry.ts': `export {}`,
      'src/router.ts': routerFile,
      'src/routes/__root.tsx': rootDocument(),
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => (typeof window === 'undefined' ? 'MARK_SERVER' : 'MARK_CLIENT'),
  component: () => <p>loader ran on {Route.useLoaderData()}</p>,
})
`,
    },
  })
}

describe('Rsbuild dev server options', () => {
  // Control: without SPA mode, the dev server renders the route (and runs
  // its loader) on the server.
  test(
    'without SPA mode, the dev server renders the route on the server',
    async () => {
      const server = await startApp()
      const response = await fetch(new URL('/', server.url))
      expect(await response.text()).toContain('MARK_SERVER')
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
      const server = await startApp({ start: { spa: { enabled: true } } })
      const response = await fetch(new URL('/', server.url))
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain('MARK_SERVER')
    },
    timeout,
  )

  // Bug: Start's plugin sets `server.compress: false` over the app's
  // config, so `server.compress: true` has no effect.
  // Source: src/rsbuild/plugin.ts (`compress: false` merged last; it worked
  // around an Rsbuild bug fixed in @rsbuild/core 2.0.5).
  // Impact: #8544: dev responses are never compressed.
  test(
    'server.compress true compresses the server-rendered page, whose content stays intact',
    async () => {
      const server = await startApp({ config: { server: { compress: true } } })
      const response = await fetch(new URL('/', server.url), {
        headers: { 'accept-encoding': 'gzip' },
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toMatch(/^text\/html/)
      expect(response.headers.get('content-encoding')).toBe('gzip')
      expect(await response.text()).toContain('MARK_SERVER')
    },
    timeout,
  )
})
