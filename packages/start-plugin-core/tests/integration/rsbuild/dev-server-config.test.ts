/**
 * Start's Rsbuild plugin on a running dev server honours the app's Start
 * options that shape what the server answers (SPA mode).
 */
import { describe, expect, test } from 'vitest'
import { appFiles, createStartApp, startRsbuildDevServer } from '../start-app'
import type { StartOptions } from '../start-app'

const timeout = 60_000

/** A dev server of an app whose `/` route tells where its loader ran. */
async function startApp(options: StartOptions = {}) {
  const app = await createStartApp(
    appFiles({
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => (typeof window === 'undefined' ? 'MARK_SERVER' : 'MARK_CLIENT'),
  component: () => \`loader ran on \${Route.useLoaderData()}\`,
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
      const response = await fetch(url)
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
      const url = await startApp({ spa: { enabled: true } })
      const response = await fetch(url)
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain('MARK_SERVER')
    },
    timeout,
  )
})
