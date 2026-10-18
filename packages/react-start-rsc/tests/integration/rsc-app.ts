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
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { mergeConfig } from 'vite'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import { onTestFinished } from 'vitest'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
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
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute, useHydrated } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
  const hydrated = useHydrated()
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <div id="app"><Outlet /></div>
        <span data-testid="hydrated">{hydrated ? 'hydrated' : 'hydrating'}</span>
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
    // An app may also import this package directly (`@tanstack/react-start-rsc`).
    symlinks: {
      ...workspacePackageLinks([
        '@tanstack/react-start',
        '@tanstack/react-start-rsc',
      ]),
      ...devServerOptions.symlinks,
    },
    config: mergeConfig(
      {
        // Start serves the pages (SSR through its dev middleware), not
        // Vite's SPA fallback.
        appType: 'custom',
        // Pre-bundled up front, as Vite does once a page discovers them
        // (the dependencies of Start's client RPC and of the Flight decoder,
        // which the browser imports on the first server function call and
        // the first decode): a discovery mid-test re-optimises and reloads
        // the page.
        optimizeDeps: {
          include: [
            '@tanstack/react-router > @tanstack/router-core > seroval',
            '@tanstack/react-router > @tanstack/router-core > seroval-plugins/web',
            '@tanstack/react-start > @tanstack/start-server-core > cookie-es',
            '@vitejs/plugin-rsc/vendor/react-server-dom/client.browser',
          ],
        },
      },
      config ?? {},
    ),
    plugins: [
      tanstackStart({ ...start, rsc: { enabled: true } }) as never,
      rsc(),
      react(),
    ],
  })
}

/**
 * Opens `pathname` of a dev server with `browser` in a real page, closed
 * when the current test finishes unless `registerCleanup` says otherwise.
 */
export function openRscPage(
  server: Pick<DevServer, 'url'>,
  pathname: string,
  options: { registerCleanup?: (cleanup: () => Promise<void>) => void } = {},
): Promise<BrowserPage> {
  if (!server.url) {
    throw new Error('the dev server does not listen: start it with `browser`')
  }
  return openPage(new URL(pathname, server.url).href, {
    registerCleanup: options.registerCleanup ?? onTestFinished,
  })
}

/**
 * Waits until the app hydrated in the page (the root route of `rscAppFiles`
 * shows it through the router's `useHydrated()`): only then does the page
 * run the client, e.g. its HMR listeners.
 */
export function waitForHydration(page: BrowserPage): Promise<void> {
  return page.waitForText('hydrated', { selector: '[data-testid=hydrated]' })
}

/**
 * Waits until Start's development-only stylesheet of the server-rendered
 * page (`/@tanstack-start/styles.css`, which prevents a flash of unstyled
 * content before hydration and which the client removes once it hydrated)
 * is gone, so that the computed styles come from what the client loaded.
 */
export async function devStylesGone(page: BrowserPage): Promise<void> {
  await page.page.waitForFunction(
    () =>
      document.querySelector('link[href*="/@tanstack-start/styles.css"]') ===
      null,
    undefined,
    { timeout: 15_000 },
  )
}

/**
 * The computed value of a CSS `property` of the first element matching
 * `selector` in the page, as the browser resolves it (colours as
 * `rgb(r, g, b)`).
 */
export function computedStyle(
  page: BrowserPage,
  selector: string,
  property: string,
): Promise<string> {
  return page.page
    .locator(selector)
    .first()
    .evaluate(
      (element, name) => getComputedStyle(element).getPropertyValue(name),
      property,
    )
}

/**
 * Waits until the computed `property` of `selector` is `expected`, for at
 * most `timeout` ms (default 15 000): a hot update applies asynchronously.
 * Throws with the current value, the page's errors and console otherwise.
 */
export async function waitForStyle(
  page: BrowserPage,
  selector: string,
  property: string,
  expected: string,
  timeout = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeout
  let current = ''
  for (;;) {
    try {
      current = await computedStyle(page, selector, property)
    } catch {
      // The page is reloading
      current = ''
    }
    if (current === expected) {
      return
    }
    if (Date.now() > deadline) {
      throw new Error(
        [
          `${selector}'s ${property} did not become ${expected} within ${timeout} ms`,
          `it is: ${JSON.stringify(current)}`,
          `page loads: ${page.loads()}`,
          `errors:\n${page.errors.join('\n') || '(none)'}`,
          `console:\n${page.console.join('\n') || '(none)'}`,
        ].join('\n'),
      )
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}
