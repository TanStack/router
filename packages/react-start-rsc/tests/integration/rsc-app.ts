/**
 * Real React Start apps with RSC enabled, for tests of what the RSC CSS
 * transform and Start's RSC wiring do end to end: a Vite dev server
 * (`startRscDevServer`) runs the app the way `vite dev` does, with the built
 * `@tanstack/react-start` (`tanstackStart({ rsc: { enabled: true } })` of its
 * `plugin/vite` entry, linked into the app's `node_modules`), Vite's own RSC
 * plugin (`@vitejs/plugin-rsc`, the three environments `client`, `ssr` and
 * `rsc`) and `@vitejs/plugin-react`. With `browser`, a real page
 * (`@tanstack/compiler-test-utils/browser`) loads the app over HTTP through
 * Start's own dev server middleware (SSR), Vite's HMR client and React
 * Refresh; Vite's own watcher reports the test's file edits (`write()`).
 *
 * The temporary apps live in this directory: their bare imports (`react`,
 * `@tanstack/react-router`, `@vitejs/plugin-rsc`, ...) resolve to this
 * package's dependencies, as in an installed app. `@tanstack/react-start`
 * is not one of them (it depends on this package), so the built workspace
 * package is linked (`workspacePackageLinks`); the `test:integration` Nx
 * target depends on its `build`.
 */
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import rsc from '@vitejs/plugin-rsc'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import { onTestFinished } from 'vitest'
import type {
  DevServer,
  DevServerOptions,
} from '@tanstack/compiler-test-utils/dev-server'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** The built workspace package `@tanstack/react-start`. */
export const reactStartPackage = workspacePackage('@tanstack/react-start')

/**
 * `tanstackStart` of the built `@tanstack/react-start/plugin/vite`, what an
 * app's `vite.config.ts` imports.
 */
async function tanstackStartVitePlugin(): Promise<
  (options?: Record<string, unknown>) => unknown
> {
  const entry = pathToFileURL(
    path.join(reactStartPackage, 'dist/esm/plugin/vite.js'),
  ).href
  const { tanstackStart } = (await import(/* @vite-ignore */ entry)) as {
    tanstackStart: (options?: Record<string, unknown>) => unknown
  }
  return tanstackStart
}

/**
 * The files every app has unless it brings its own: Start's router entry
 * (the real router over the generated route tree) and a root route that
 * renders the document with Start's `HeadContent` and `Scripts`, so pages
 * hydrate and load the client.
 */
export const rscAppFiles = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <Scripts />
      </body>
    </html>
  )
}
`,
}

export interface RscDevServerOptions extends Omit<
  DevServerOptions,
  'dir' | 'plugins'
> {
  /** Start's plugin options (`tanstackStart(options)`), `rsc` enabled. */
  start?: Record<string, unknown>
}

/**
 * Starts a Vite dev server on a React Start app with RSC enabled, of
 * `files` over `rscAppFiles`. Without `browser`, the server runs in
 * middleware mode and `settle()`/`edit()` replay file events; the `rsc`
 * environment is runnable (`server.import(url, 'rsc')` runs a module in the
 * provider).
 */
export async function startRscDevServer(
  options: RscDevServerOptions,
): Promise<DevServer> {
  const { files, start, config, ...devServerOptions } = options
  const tanstackStart = await tanstackStartVitePlugin()
  return createDevServer({
    dir: harnessDir,
    prefix: '.rsc-dev-server-',
    registerCleanup: onTestFinished,
    ...devServerOptions,
    files: { ...rscAppFiles, ...files },
    symlinks: {
      ...workspacePackageLinks(['@tanstack/react-start']),
      ...devServerOptions.symlinks,
    },
    // Start serves the pages (SSR through its dev middleware), not Vite's
    // SPA fallback.
    config: { appType: 'custom', ...config },
    plugins: [
      tanstackStart({ ...start, rsc: { enabled: true } }) as never,
      rsc(),
      react(),
    ],
  })
}
