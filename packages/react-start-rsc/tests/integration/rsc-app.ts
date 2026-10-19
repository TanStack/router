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
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
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
import type {
  RsbuildDevServer,
  RsbuildDevServerOptions,
} from '@tanstack/compiler-test-utils/rsbuild-dev-server'

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
 * `tanstackStart` of the built `@tanstack/react-start/plugin/rsbuild`, what
 * an app's `rsbuild.config.ts` imports.
 */
async function tanstackStartRsbuildPlugin(): Promise<
  (options?: Record<string, unknown>) => unknown
> {
  const entry = pathToFileURL(
    path.join(reactStartPackage, 'dist/esm/plugin/rsbuild.js'),
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
 * middleware mode (Vite's watcher still reports `write()`s, which
 * `settle()` waits for); the `rsc` environment is runnable
 * (`server.import(url, 'rsc')` runs a module in the provider).
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

export interface RscRsbuildDevServerOptions extends Omit<
  RsbuildDevServerOptions,
  'dir' | 'plugins' | 'entry'
> {
  /** Start's plugin options (`tanstackStart(options)`), `rsc` enabled. */
  start?: Record<string, unknown>
  /**
   * Runs the server with the app root as the working directory, as
   * `rsbuild dev` in the app does (default `true`). With `false`, the test
   * process's directory stays (`rsbuild dev --root <app>` from elsewhere).
   */
  inAppDirectory?: boolean
}

/**
 * Starts an Rsbuild dev server on a React Start app with RSC enabled, of
 * `files` over `rscAppFiles`, with the built `@tanstack/react-start/plugin/
 * rsbuild` (Start's client and SSR environments, its default entries, the
 * RSC layer and `react-server-dom-rspack`). React's JSX runtime is
 * configured as `@rsbuild/plugin-react` does (this package has no such
 * dependency). With `browser`, Start's own dev middleware serves the pages
 * (SSR) and Rsbuild's HMR client runs in the page.
 */
export async function startRscRsbuildDevServer(
  options: RscRsbuildDevServerOptions,
): Promise<RsbuildDevServer> {
  const {
    files,
    start,
    config,
    inAppDirectory = true,
    ...devServerOptions
  } = options
  const tanstackStart = await tanstackStartRsbuildPlugin()
  const cwd = process.cwd()
  try {
    return await createRsbuildDevServer({
      dir: harnessDir,
      prefix: '.rsc-rsbuild-dev-server-',
      registerCleanup: onTestFinished,
      ...devServerOptions,
      // Start's plugin defines the entries of its environments (the harness
      // default is overridden by its client entry of the same name).
      entry: 'src/router.tsx',
      files: { ...rscAppFiles, ...files },
      symlinks: {
        ...workspacePackageLinks([
          '@tanstack/react-start',
          '@tanstack/react-start-rsc',
        ]),
        ...devServerOptions.symlinks,
      },
      config: {
        ...config,
        tools: {
          // Start serves the pages, not an HTML template
          htmlPlugin: false,
          swc: {
            jsc: {
              transform: {
                react: { runtime: 'automatic', development: true },
              },
            },
          },
          ...config?.tools,
        },
      },
      plugins: [
        {
          name: 'rsc-app:working-directory',
          setup(api) {
            if (inAppDirectory) {
              process.chdir(api.context.rootPath)
            }
          },
        },
        tanstackStart({ ...start, rsc: { enabled: true } }) as never,
      ],
    })
  } finally {
    process.chdir(cwd)
  }
}

/** The HTTP requests of a page in flight, and when that last changed. */
interface Network {
  pending: Set<unknown>
  changed: number
}

const networks = new WeakMap<BrowserPage, Network>()

/**
 * Opens `pathname` of a dev server with `browser` in a real page, closed
 * when the current test finishes unless `registerCleanup` says otherwise.
 * The page's requests from then on are tracked for `settledValue`.
 */
export async function openRscPage(
  server: Pick<DevServer | RsbuildDevServer, 'url'>,
  pathname: string,
  options: { registerCleanup?: (cleanup: () => Promise<void>) => void } = {},
): Promise<BrowserPage> {
  if (!server.url) {
    throw new Error('the dev server does not listen: start it with `browser`')
  }
  const page = await openPage(new URL(pathname, server.url).href, {
    registerCleanup: options.registerCleanup ?? onTestFinished,
  })
  const network: Network = { pending: new Set(), changed: Date.now() }
  page.page.on('request', (request) => {
    network.pending.add(request)
    network.changed = Date.now()
  })
  const done = (request: unknown) => {
    if (network.pending.delete(request)) {
      network.changed = Date.now()
    }
  }
  page.page.on('requestfinished', done)
  page.page.on('requestfailed', done)
  networks.set(page, network)
  return page
}

/**
 * Reads `read()` until `accept` takes its value, or until the page's
 * network has settled (no request in flight for `quiet` ms, default 500)
 * and one more read still does not: then whatever the page will show
 * without another request, e.g. a stylesheet that never arrives. Gives up
 * after `timeout` ms (default 15 000). Gives the last value read; the test
 * asserts on it. For pages of `openRscPage`.
 */
export async function settledValue<T>(
  page: BrowserPage,
  read: () => Promise<T>,
  accept: (value: T) => boolean,
  { quiet = 500, timeout = 15_000 } = {},
): Promise<T> {
  const network = networks.get(page)
  if (!network) {
    throw new Error('settledValue needs a page of openRscPage')
  }
  const deadline = Date.now() + timeout
  for (;;) {
    const settled =
      network.pending.size === 0 && Date.now() - network.changed >= quiet
    let value: T | undefined
    let readable = true
    try {
      value = await read()
    } catch (error) {
      // The page is (re)loading
      readable = false
      if (Date.now() > deadline) {
        throw error
      }
    }
    if (readable && (accept(value as T) || settled || Date.now() > deadline)) {
      return value as T
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
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
