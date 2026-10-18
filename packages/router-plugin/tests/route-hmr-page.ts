/**
 * Route HMR as an app sees it: a real dev server (Vite with the router
 * plugin and the framework's own Vite plugin, or Rsbuild with the router
 * plugin's Rspack entry and the framework's Rsbuild plugin) serves a small
 * file-based app with the real router package, a real browser page
 * (headless Chromium) runs it with the dev server's own HMR client, and the
 * test edits route files on disk, which the dev server's own file watcher
 * reports. The test reads the page: what it shows, whether it reloaded, and
 * what it logged.
 *
 * Nothing of the HMR path is modelled: the bundler decides which modules
 * accept the update, the framework's refresh runtime (React Refresh, Solid
 * Refresh, Vue's HMR runtime) patches components, and the route HMR code
 * the router plugin emits updates the live router. The harness only waits on
 * what the real tools report: the dev server's plugin hooks and HMR
 * messages, the HMR client's public update events, the page's document
 * loads, and the page's text.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginBabel } from '@rsbuild/plugin-babel'
import { pluginReact } from '@rsbuild/plugin-react'
import { pluginSolid } from '@rsbuild/plugin-solid'
import { pluginVue } from '@rsbuild/plugin-vue'
import { pluginVueJsx } from '@rsbuild/plugin-vue-jsx'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { getConfig } from '../src/core/config'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { tanstackRouter } from '../src/vite'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { Plugin, PluginOption } from 'vite'
import type { Config } from '../src/core/config'
import type { TargetFramework } from './regression-helpers'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * How the app counts the updates its HMR client applied, through the
 * client's public API: Vite's `vite:afterUpdate` event, and the
 * webpack-style hot API's status handler (Rspack), which reports `idle`
 * again once an update is applied. The count is read by `edit()`.
 */
const hmrProbes = {
  vite: `if (import.meta.hot) {
  import.meta.hot.on('vite:afterUpdate', () => {
    window.__routeHmrApplied = (window.__routeHmrApplied ?? 0) + 1
  })
}
`,
  rsbuild: `if (import.meta.webpackHot) {
  let status = import.meta.webpackHot.status()
  import.meta.webpackHot.addStatusHandler((next) => {
    if (next === 'idle' && status !== 'idle') {
      window.__routeHmrApplied = (window.__routeHmrApplied ?? 0) + 1
    }
    status = next
  })
}
`,
}

/** How the app mounts the router into `#app`, per framework. */
const mains: Record<TargetFramework, string> = {
  react: `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  solid: `import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
render(() => <RouterProvider router={router} />, document.getElementById('app')!)
`,
  vue: `import { createApp } from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createApp({ setup: () => () => <RouterProvider router={router} /> }).mount('#app')
`,
}

/** The framework's own Vite plugin, as an app adds it. */
const frameworkVitePlugins: Record<TargetFramework, () => PluginOption> = {
  react: () => react(),
  solid: () => solid(),
  vue: () => vueJsx(),
}

/**
 * The framework's own Rsbuild plugins, as an app adds them (the Solid and
 * Vue JSX plugins compile JSX with Babel: `@rsbuild/plugin-babel`).
 */
const frameworkRsbuildPlugins: Record<
  TargetFramework,
  (options: RouteHmrPageOptions) => Array<RsbuildPlugin>
> = {
  react: (options) => [
    pluginReact({ fastRefresh: options.reactRefresh ?? true }),
  ],
  solid: () => [pluginBabel({ include: /\.(?:jsx|tsx)$/ }), pluginSolid()],
  vue: () => [
    pluginBabel({ include: /\.(?:jsx|tsx)$/ }),
    pluginVue(),
    pluginVueJsx(),
  ],
}

/**
 * Dependencies the app imports, pre-bundled up front as Vite does for an app
 * that installed them (the router package is a linked workspace package
 * here, which Vite would otherwise serve as source and discover the
 * dependencies of late, reloading the page).
 */
const prebundled: Record<TargetFramework, Array<string>> = {
  react: [
    'react',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
  ],
  solid: [],
  vue: ['vue', '@tanstack/vue-router'],
}

export interface RouteHmrPageOptions {
  /** Default `vite`. */
  bundler?: 'vite' | 'rsbuild'
  /** Default `react`. */
  target?: TargetFramework
  /**
   * Router plugin options over the defaults (`autoCodeSplitting: true`, the
   * app's `routes/` directory and route tree); `null` gives the plugin no
   * options (Vite only: it reads the app's `tsr.config.json`).
   */
  pluginOptions?: Partial<Config> | null
  /**
   * Gives the router plugin its options as a function returning them, as
   * `tanstackRouter(() => config)` allows (Vite only). Default: an object.
   */
  pluginOptionsAsFunction?: boolean
  /**
   * Whether the app adds its framework's plugin (default `true`):
   * `@vitejs/plugin-react`, `vite-plugin-solid` or `@vitejs/plugin-vue-jsx`
   * with Vite, `@rsbuild/plugin-react`, `@rsbuild/plugin-solid` or
   * `@rsbuild/plugin-vue` + `@rsbuild/plugin-vue-jsx` with Rsbuild. Without
   * it, a React app runs without React Refresh (Vite compiles its JSX
   * itself; Rsbuild's SWC does too).
   */
  frameworkPlugin?: boolean
  /**
   * Rsbuild: `@rsbuild/plugin-react`'s `fastRefresh` (default `true`); a
   * React app on Rsbuild without React Refresh sets it to `false`.
   */
  reactRefresh?: boolean
  /**
   * App files relative to its root: route files in `routes/`
   * (`routes/__root.tsx` defaults to an empty root route, which renders its
   * child routes) and any other module they import. `main.tsx` defaults to
   * an entry mounting the router into `#app`.
   */
  files: Record<string, string>
  /** Text the app shows once it rendered. */
  ready: string | RegExp
  /** How long the app may take to show `ready` (default 15 s). */
  readyTimeout?: number
  /**
   * Registers the cleanup (closing the page and the dev server) to run when
   * the test ends. Default: vitest's `onTestFinished`; a concurrent test
   * passes the one of its test context.
   */
  onTestFinished?: (cleanup: () => Promise<void>) => void
}

export interface EditResult {
  /** The page did a full reload instead of a hot update. */
  reloaded: boolean
  /**
   * Uncaught errors of the page and what it logged with `console.error`
   * since the edit began: the HMR client's and the framework's reports of a
   * failed update, and whatever the app logs itself (a test with a route
   * that deliberately throws leaves those out).
   */
  errors: Array<string>
}

export interface RouteHmrPage {
  /** The browser page. */
  page: BrowserPage
  /** How many times the page loaded (its first load included). */
  loads: () => number
  /** Clicks the first element matching `selector`. */
  click: (selector: string) => Promise<void>
  /**
   * Writes app files (`null` deletes one) for the dev server's watcher to
   * pick up, waits until the dev server handled them and the app shows
   * `expected`, then until the HMR client applied every update the server
   * sent and the server is quiet, and returns whether the page reloaded
   * meanwhile and what it logged.
   *
   * Fails as soon as the HMR client reports the update applied and the app
   * still does not show `expected` shortly after, or after `timeout`
   * (default 15 s) otherwise (a full reload shows `expected` once the page
   * loaded again).
   */
  edit: (
    files: Record<string, string | null>,
    expected: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<EditResult>
  /**
   * Runs `script` in the page (e.g. reads the live router,
   * `window.__TSR_ROUTER__`) and returns its JSON value.
   */
  evaluate: <T>(script: string) => Promise<T>
}

/** The part of a dev server the page needs. */
interface AppServer {
  url: string
  /**
   * Writes files for the server's watcher and waits until the server
   * handled them (Vite: ran the HMR hooks for each file; Rsbuild: finished
   * the compile that includes them).
   */
  write: (
    files: Record<string, string | null>,
    timeout: number,
  ) => Promise<void>
  /** Waits until the server has no work in flight. */
  idle: () => Promise<void>
  /** Hot updates the server sent the page so far. */
  updates: () => number
  /** Full reloads the server sent the page so far. */
  fullReloads: () => number
}

/**
 * How long the page may take to show an edit once its HMR client reported
 * the update applied: the framework's refresh runtime patches components a
 * few milliseconds later (React Refresh debounces by 16–30 ms), then the
 * router re-runs loaders and renders.
 */
const appliedGrace = 500

/**
 * How long the server and the page must stay quiet (no new HMR message, no
 * new document load) after an edit showed, before `edit()` returns: a
 * reload the dev server decides after the update (e.g. for a file a plugin
 * wrote while handling the edit) arrives within this time.
 */
const quietTime = 100

const defaultEditTimeout = 15_000

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Starts a dev server on an app of `files` (see `RouteHmrPageOptions`), opens
 * it in a browser page and waits until it shows `ready`.
 */
export async function openRouteHmrPage(
  options: RouteHmrPageOptions,
): Promise<RouteHmrPage> {
  const target = options.target ?? 'react'
  const bundler = options.bundler ?? 'vite'
  const files = {
    'main.tsx': `${mains[target]}${hmrProbes[bundler]}`,
    'routes/__root.tsx': `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`,
    ...options.files,
  }
  const server =
    bundler === 'vite'
      ? await viteServer(target, files, options)
      : await rsbuildServer(target, files, options)
  const page = await openPage(server.url, {
    registerCleanup: options.onTestFinished ?? onTestFinished,
  })
  await page.waitForText(options.ready, {
    selector: '#app',
    timeout: options.readyTimeout,
  })
  await server.idle()

  const text = async () => {
    try {
      return await page.text('#app')
    } catch {
      // The page is reloading
      return ''
    }
  }
  const matches = (expected: string | RegExp, current: string) =>
    typeof expected === 'string'
      ? current.includes(expected)
      : expected.test(current)
  /** Updates the page's HMR client applied so far (see `hmrProbes`). */
  const applied = async () => {
    try {
      return await page.page.evaluate<number>('window.__routeHmrApplied ?? 0')
    } catch {
      // The page is reloading
      return undefined
    }
  }
  const describe = (expected: string | RegExp, current: string) =>
    [
      `the page shows: ${JSON.stringify(current)}`,
      `expected: ${String(expected)}`,
      `page loads: ${page.loads()}`,
      `errors:\n${page.errors.join('\n') || '(none)'}`,
      `console:\n${page.console.join('\n') || '(none)'}`,
    ].join('\n')

  return {
    page,
    loads: () => page.loads(),
    click: async (selector) => {
      await page.page.locator(selector).first().click()
    },
    edit: async (edited, expected, editOptions = {}) => {
      const timeout = editOptions.timeout ?? defaultEditTimeout
      const start = {
        loads: page.loads(),
        errors: page.errors.length,
        applied: (await applied()) ?? 0,
        updates: server.updates(),
        fullReloads: server.fullReloads(),
      }
      const reloaded = () =>
        page.loads() > start.loads || server.fullReloads() > start.fullReloads
      const deadline = Date.now() + timeout
      await server.write(edited, timeout)

      // Until the page shows the edit
      let appliedAt: number | undefined
      for (;;) {
        const current = await text()
        if (matches(expected, current)) {
          break
        }
        if (!reloaded()) {
          const count = await applied()
          if (count !== undefined && count > start.applied) {
            appliedAt ??= Date.now()
            if (Date.now() - appliedAt > appliedGrace) {
              throw new Error(
                `the page's HMR client applied the update of ${Object.keys(edited).join(', ')} but the page does not show the edit\n${describe(expected, current)}`,
              )
            }
          }
        }
        if (Date.now() > deadline) {
          throw new Error(
            `the page did not show the edit of ${Object.keys(edited).join(', ')} within ${timeout} ms\n${describe(expected, current)}`,
          )
        }
        await sleep(25)
      }

      // Until the client applied every update the server sent, and nothing
      // else comes
      for (;;) {
        await server.idle()
        const quietUntil = Date.now() + quietTime
        const seen = {
          loads: page.loads(),
          updates: server.updates(),
          fullReloads: server.fullReloads(),
        }
        let moved = false
        while (Date.now() < quietUntil) {
          await sleep(25)
          const count = await applied()
          const pending =
            !reloaded() &&
            count !== undefined &&
            count - start.applied < seen.updates - start.updates
          if (
            pending ||
            page.loads() !== seen.loads ||
            server.updates() !== seen.updates ||
            server.fullReloads() !== seen.fullReloads
          ) {
            moved = true
            break
          }
        }
        if (!moved) {
          break
        }
        if (Date.now() > deadline) {
          throw new Error(
            `the dev server and the page did not settle after the edit of ${Object.keys(edited).join(', ')} within ${timeout} ms\n${describe(expected, await text())}`,
          )
        }
      }
      return {
        reloaded: reloaded(),
        errors: page.errors.slice(start.errors),
      }
    },
    evaluate: (script) => page.page.evaluate(script),
  }
}

/** The router plugin's options for an app at `root`. */
function routerPluginOptions(
  target: TargetFramework,
  root: string,
  options: RouteHmrPageOptions,
): Partial<Config> {
  return {
    target,
    routesDirectory: path.join(root, 'routes'),
    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
    autoCodeSplitting: true,
    ...options.pluginOptions,
  }
}

async function viteServer(
  target: TargetFramework,
  files: Record<string, string>,
  options: RouteHmrPageOptions,
): Promise<AppServer> {
  /** How many times the server ran the client HMR hooks for each file. */
  const handled = new Map<string, number>()
  const handledTimes = (file: string) => handled.get(file) ?? 0
  /** Records the files the server handled hot updates for (a plugin hook). */
  const recordingPlugin: Plugin = {
    name: 'route-hmr-page',
    hotUpdate({ file }) {
      if (this.environment.name === 'client') {
        handled.set(file, handledTimes(file) + 1)
      }
    },
  }
  const server = await createDevServer({
    dir: harnessDir,
    prefix: '.route-hmr-page-',
    registerCleanup: options.onTestFinished ?? onTestFinished,
    browser: true,
    files: {
      'index.html': `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
`,
      ...files,
    },
    config: { optimizeDeps: { include: prebundled[target] } },
    plugins: ({ root }) => [
      options.pluginOptions === null
        ? tanstackRouter()
        : options.pluginOptionsAsFunction
          ? tanstackRouter(() =>
              getConfig(routerPluginOptions(target, root, options), root),
            )
          : tanstackRouter(routerPluginOptions(target, root, options)),
      ...(options.frameworkPlugin === false
        ? []
        : [frameworkVitePlugins[target]()]),
      recordingPlugin,
    ],
  })
  const clientMessages = (type: 'update' | 'full-reload') => () =>
    server.hmr.filter(
      (message) => message.environment === 'client' && message.type === type,
    ).length
  return {
    url: server.url!,
    write: async (edited, timeout) => {
      const before = Object.keys(edited).map((relative) => {
        const file = server.file(relative)
        return { file, count: handledTimes(file) }
      })
      await server.write(edited)
      // Until the server's watcher reported each file and the server ran
      // the HMR hooks for it
      const deadline = Date.now() + timeout
      while (before.some(({ file, count }) => handledTimes(file) === count)) {
        if (Date.now() > deadline) {
          throw new Error(
            `the dev server did not handle the edit of ${before
              .filter(({ file, count }) => handledTimes(file) === count)
              .map(({ file }) => path.relative(server.root, file))
              .join(', ')} within ${timeout} ms`,
          )
        }
        await sleep(10)
      }
    },
    idle: () => server.idle(),
    updates: clientMessages('update'),
    fullReloads: clientMessages('full-reload'),
  }
}

async function rsbuildServer(
  target: TargetFramework,
  files: Record<string, string>,
  options: RouteHmrPageOptions,
): Promise<AppServer> {
  if (options.pluginOptions === null || options.pluginOptionsAsFunction) {
    throw new Error(
      'the Rsbuild page gives the router plugin its options as an object',
    )
  }
  const server = await createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.route-hmr-page-rsbuild-',
    registerCleanup: options.onTestFinished ?? onTestFinished,
    browser: true,
    entry: 'main.tsx',
    files,
    config: { html: { mountId: 'app' } },
    plugins: ({ root }) => [
      ...(options.frameworkPlugin === false
        ? []
        : frameworkRsbuildPlugins[target](options)),
      {
        name: 'route-hmr-page',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push(
              tanstackRouterRspack(routerPluginOptions(target, root, options)),
            )
          })
        },
      } satisfies RsbuildPlugin,
    ],
  })
  let updates = 0
  return {
    url: server.url!,
    write: async (edited) => {
      // Until the compile that includes the edit ended; its hot-update
      // chunks are what the page applies
      await server.edit(edited)
      if (Object.keys(await server.hotUpdates()).length > 0) {
        updates++
      }
    },
    idle: () => Promise.resolve(),
    updates: () => updates,
    // Rsbuild's client reloads the page itself: the page's loads tell
    fullReloads: () => 0,
  }
}
