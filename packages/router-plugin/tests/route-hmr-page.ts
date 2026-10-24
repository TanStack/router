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
 * the router plugin emits updates the live router. The harness waits on the
 * edit's outcome (`waitForOutcome`, coupling N21): the dev-server harnesses'
 * `settle()`, then the page showing the edit with neither the dev server
 * nor the page having work in flight (transforms, the page's requests, a
 * reload), within one overall bound; never on how many hot updates or
 * client events an edit takes. Warnings are diagnostics
 * (`@tanstack/compiler-test-utils/diagnostics`): every channel of the dev
 * server (its logger or the bundler's compilation, and what the process
 * printed while doing this app's work) and the page's console.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
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
import { expect } from 'vitest'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { openDiagnosticChannel } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticsOf,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { getConfig, tanstackRouter } from '../src/vite'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { PluginOption } from 'vite'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { Config } from '../src/vite'
import type { TargetFramework } from './route-app'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * How the app mounts the router into `#app`, per framework, with the router
 * options `ROUTER_OPTIONS` stands for. The app keeps its own reference to its
 * router (`window.__APP_ROUTER__`), which tests read.
 */
const mains: Record<TargetFramework, string> = {
  react: `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree, ROUTER_OPTIONS })
;(window as any).__APP_ROUTER__ = router
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`,
  solid: `import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree, ROUTER_OPTIONS })
;(window as any).__APP_ROUTER__ = router
render(() => <RouterProvider router={router} />, document.getElementById('app')!)
`,
  vue: `import { createApp } from 'vue'
import { RouterProvider, createRouter } from '@tanstack/vue-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree, ROUTER_OPTIONS })
;(window as any).__APP_ROUTER__ = router
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
  /**
   * More options of the app's router, as source (e.g. `defaultErrorComponent:
   * () => null`), in the default `main.tsx`.
   */
  routerOptions?: string
  /**
   * More plugins of the dev server, after the router and framework plugins
   * (e.g. a test plugin emitting a diagnostic through the bundler's own
   * channel): Vite plugins with Vite, Rsbuild plugins with Rsbuild.
   */
  plugins?: { vite?: Array<PluginOption>; rsbuild?: Array<RsbuildPlugin> }
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
  /** Whether the page reloaded, observed through the caller's final assertions. */
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
  /** The app's root on disk. */
  root: string
  /** How many times the page loaded (its first load included). */
  loads: () => number
  /** Clicks the first element matching `selector`. */
  click: (selector: string) => Promise<void>
  /**
   * Writes app files (`null` deletes one) for the dev server's watcher to
   * pick up, waits until the dev server handled them (`settle()`), then for
   * the edit's outcome (`waitForOutcome`): the app shows `expected` and
   * neither the dev server (transforms) nor the page (requests, a reload)
   * has work in flight, twice in a row; returns whether the page reloaded
   * meanwhile and what it logged. One overall bound, `timeout` (default
   * 15 s): how many updates or client events the edit takes is the
   * compiler's business (a full reload shows `expected` once the page
   * loaded again). An edit that leaves the page without `expected` while
   * neither has anything of it in flight for 3 s (`editQuietFailure`) has
   * reached its final state: it fails then.
   */
  edit: (
    files: Record<string, string | null>,
    expected: string | RegExp,
    options?: { timeout?: number },
  ) => Promise<EditResult>
  /**
   * Runs `script` in the page (e.g. reads the app's live router,
   * `window.__APP_ROUTER__`) and returns its JSON value.
   */
  evaluate: <T>(script: string) => Promise<T>
  /**
   * Warnings reported so far through the real channels, as diagnostics (read
   * them with `findDiagnostics` / `expectDiagnostic`): every channel of the
   * dev server (`appWarnings`: its logger or the bundler's compilation, and
   * what the process printed while doing this app's work: concurrent pages
   * share the process, and the async context of the app's dev server tells
   * their output apart, whatever the warning's wording or path form), and
   * what the page logged as a warning (e.g. a warning the compiler put into
   * the served module).
   */
  warnings: () => Array<Diagnostic>
}

/**
 * The async context of each app's dev server: everything a dev server does
 * (its watcher, its HTTP requests, its compiles) runs in the context it was
 * created in, so what the process prints meanwhile is that app's.
 */
const appScope = new AsyncLocalStorage<string>()
let apps = 0

/** The apps whose output `processOutput` is reading. */
const openApps = new Set<string>()

/**
 * What the process printed (console, stdout/stderr) while doing the work of
 * app `id` (`appScope`), from now on until the test ends. Pages of
 * concurrent tests share the process's console; the context tells their
 * output apart, so a warning counts whatever path form (absolute or
 * project-relative) and wording it has. Output outside any app's context
 * counts when it names the app's root (`root()`, once known), or, whatever
 * path form it has, when it was printed while no other app was open.
 */
function processOutput(
  id: string,
  root: () => string | undefined,
  registerCleanup: (cleanup: () => Promise<void>) => void,
) {
  const channel = openDiagnosticChannel()
  const scoped: Array<ChannelDiagnostic> = []
  const unscoped: Array<{ diagnostic: ChannelDiagnostic; alone: boolean }> = []
  openApps.add(id)
  channel.onDiagnostic((diagnostic) => {
    const store = appScope.getStore()
    if (store === id) {
      scoped.push(diagnostic)
    } else if (store === undefined) {
      unscoped.push({ diagnostic, alone: openApps.size === 1 })
    }
  })
  registerCleanup(() => {
    openApps.delete(id)
    channel.close()
    return Promise.resolve()
  })
  return () => {
    const appRoot = root()
    return [
      ...scoped,
      ...unscoped
        .filter(
          ({ diagnostic, alone }) =>
            alone ||
            (appRoot !== undefined && diagnostic.text.includes(appRoot)),
        )
        .map(({ diagnostic }) => diagnostic),
    ]
  }
}

/**
 * The warnings of an app on every channel of its dev server: the
 * bundler's and the dev server's own (`server`, from the server's own
 * logger and compilations), and what the process printed doing the app's
 * work (`printed`, see `processOutput`).
 */
function appWarnings(
  server: Array<ChannelDiagnostic>,
  printed: Array<ChannelDiagnostic>,
) {
  return [
    ...server.filter(
      (diagnostic) =>
        diagnostic.source === 'vite' || diagnostic.source === 'bundler',
    ),
    ...printed,
  ]
    .filter((diagnostic) => diagnostic.severity === 'warning')
    .map((diagnostic) => diagnostic.text)
}

/** The part of a dev server the page needs. */
interface AppServer {
  url: string
  /** The app's root on disk. */
  root: string
  /**
   * What the dev server's own logger and compilations reported so far
   * (`appWarnings` takes their warnings).
   */
  diagnostics: () => Array<ChannelDiagnostic>
  /**
   * Writes files for the server's watcher and waits until the server
   * handled them, by the harness's event-based `settle()` (Vite: the
   * watcher reported each file, Vite handled each event, and the files
   * plugins wrote meanwhile; Rsbuild: the compiles read every written file
   * and nothing is compiling or pending).
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Waits until the server has no work in flight. */
  idle: () => Promise<void>
  /** Full reloads the server sent the page so far. */
  fullReloads: () => number
}

const defaultEditTimeout = 15_000

/**
 * How long the dev server and the page stay quiet (nothing of the edit in
 * flight on either) while the page does not show the edit, before the edit
 * counts as not shown (`waitForOutcome`'s `failWhenQuietFor`): an edit a
 * compiler does not apply fails then, not at `defaultEditTimeout`.
 */
const editQuietFailure = 3_000

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
    'main.tsx': mains[target].replace(
      'ROUTER_OPTIONS',
      options.routerOptions ?? '',
    ),
    'routes/__root.tsx': `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`,
    ...options.files,
  }
  // What the process prints doing this app's work (the compiler may warn
  // there, e.g. about a route it leaves unsplit): the dev server is created
  // in the app's async context, so its watcher, requests and compiles run
  // there
  const id = `route-hmr-page-${++apps}`
  let appRoot: string | undefined
  const printed = processOutput(
    id,
    () => appRoot,
    options.onTestFinished ?? onTestFinished,
  )
  const { server, page } = await (async () => {
    const started = await appScope.run(id, () =>
      bundler === 'vite'
        ? viteServer(target, files, options)
        : rsbuildServer(target, files, options),
    )
    appRoot = started.root
    const opened = await openPage(started.url, {
      registerCleanup: options.onTestFinished ?? onTestFinished,
    })
    await opened.waitForText(options.ready, {
      selector: '#app',
      timeout: options.readyTimeout,
    })
    await started.idle()
    return { server: started, page: opened }
  })()

  const text = async () => {
    try {
      return await page.text('#app')
    } catch {
      // The page is reloading
      return ''
    }
  }
  /**
   * The page's requests in flight: module and hot-update fetches, and the
   * document of a full reload.
   */
  const pageRequests = new Set<unknown>()
  page.page.on('request', (request) => pageRequests.add(request))
  page.page.on('requestfinished', (request) => pageRequests.delete(request))
  page.page.on('requestfailed', (request) => pageRequests.delete(request))
  // A new document (a full reload) ends the old one: its requests in flight
  // end with it, whether or not the browser reports them as finished or
  // failed (the new document's own requests come after)
  page.page.on('framenavigated', (frame) => {
    if (frame === page.page.mainFrame()) {
      pageRequests.clear()
    }
  })

  const matches = (expected: string | RegExp, current: string) =>
    typeof expected === 'string'
      ? current.includes(expected)
      : expected.test(current)
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
    root: server.root,
    loads: () => page.loads(),
    click: async (selector) => {
      await page.page.locator(selector).first().click()
    },
    edit: (edited, expected, editOptions = {}) =>
      (async () => {
        const timeout = editOptions.timeout ?? defaultEditTimeout
        const start = {
          loads: page.loads(),
          errors: page.errors.length,
          fullReloads: server.fullReloads(),
        }
        const reloaded = () =>
          page.loads() > start.loads || server.fullReloads() > start.fullReloads
        const deadline = Date.now() + timeout
        const files = Object.keys(edited).join(', ')
        await server.write(edited)

        // Until the edit's outcome (N21; `waitForOutcome`): the page shows
        // the edit, and neither the dev server nor the page has work of it
        // in flight, within one overall bound. How many hot updates,
        // invalidations or `vite:afterUpdate` events the edit takes, and how
        // soon after the first one the page shows it, are the compiler's
        // business.
        await waitForOutcome({
          timeout: Math.max(0, deadline - Date.now()),
          // The server handled the edit (`write` settled): once neither it
          // nor the page has anything of it in flight for this long, the
          // page shows what the edit leads to
          failWhenQuietFor: editQuietFailure,
          applied: async () => matches(expected, await text()),
          quiet: async () => {
            await server.idle()
            return pageRequests.size === 0
          },
          describe: async () =>
            `edit of ${files}\n${describe(expected, await text())}`,
        })
        return {
          get reloaded() {
            return reloaded()
          },
          get errors() {
            return page.errors.slice(start.errors)
          },
        }
      })(),
    evaluate: (script) => page.page.evaluate(script),
    warnings: () => [
      ...diagnosticsOf(appWarnings(server.diagnostics(), printed()), 'warning'),
      ...diagnosticsOf(
        page.console
          .filter((message) => message.startsWith('warning: '))
          .map((message) => message.slice('warning: '.length)),
        'warning',
      ),
    ],
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
      ...(options.plugins?.vite ?? []),
    ],
  })
  const fullReloads = () =>
    server.hmr.filter(
      (message) =>
        message.environment === 'client' && message.type === 'full-reload',
    ).length
  return {
    url: server.url!,
    write: async (edited) => {
      await server.edit(edited)
    },
    idle: () => server.idle(),
    fullReloads,
    root: server.root,
    diagnostics: () => server.diagnostics,
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
      ...(options.plugins?.rsbuild ?? []),
    ],
  })
  return {
    url: server.url!,
    write: async (edited) => {
      // Until the edit's outcome on the server: a compile that read it
      // ended and nothing compiles anymore
      await server.write(edited)
      await server.settle()
    },
    idle: () => Promise.resolve(),
    // Rsbuild's client reloads the page itself: the page's loads tell
    fullReloads: () => 0,
    root: server.root,
    // Every compile's (the page's edits settle before they are read)
    diagnostics: () => server.diagnostics,
  }
}

/**
 * A statement for the body of a React component (with `useState` in scope)
 * that counts the component's mounts under `name` (`mountsOf`): a state
 * initializer, which React runs when it mounts the component only. React
 * Refresh keeps the state of a component it patches in place, so a body
 * edit it patches mounts nothing anew; a remount counts again.
 */
/**
 * Whether a page error (`EditResult.errors`) is the app's own deliberate
 * error `message` (\`throw new Error(message)\`): it reports that error
 * (\`Error: <message>\`), not a report quoting the source that throws it (a
 * transform or HMR error's code frame), which stays an error of the edit.
 */
export function isAppError(error: string, message: string) {
  return (
    error.includes(`Error: ${message}`) &&
    !['"', "'", '`'].some((quote) =>
      error.includes(`Error(${quote}${message}${quote}`),
    )
  )
}

export const countMounts = (name: string) =>
  `useState(() => { const mounts = (window.__mounts ??= {}); mounts[${JSON.stringify(name)}] = (mounts[${JSON.stringify(name)}] ?? 0) + 1 })`

/** The mounts `countMounts` counted in the page, by name. */
export function mountsOf(app: RouteHmrPage): Promise<Record<string, number>> {
  return app.evaluate('window.__mounts ?? {}')
}

/**
 * Edits a route the compiler may handle, or leave to a reported fallback
 * (an unsupported but user-fixable shape: R-09, D11), and asserts what
 * both outcomes share: the page shows the edit (`expected`: new loader data
 * and component, also after a reload) without errors. A diagnostic never
 * stands in for that. Without a warning naming `file` through a real
 * channel (`app.warnings()`: the dev server's logger, its console, the
 * page), the edit must also apply in place (no reload); with one (the
 * fallback, e.g. the route left unsplit), a reload is allowed (V1R hmr H08,
 * split S11). Returns which outcome it was.
 */
export async function expectEditShownOrReportedFallback(
  app: RouteHmrPage,
  edited: Record<string, string | null>,
  expected: string | RegExp,
  file: string,
): Promise<'in place' | 'reported fallback'> {
  const result = await app.edit(edited, expected)
  expect(result.errors, 'errors of the page during the edit').toEqual([])
  // (a warning: the page shows the edit, so nothing was refused)
  const reported =
    findDiagnostics(app.warnings(), {
      severity: 'warning',
      file,
      root: app.root,
    }).length > 0
  if (!reported) {
    expect(
      result.reloaded,
      `without a warning naming ${file}, the edit applies in place`,
    ).toBe(false)
    return 'in place'
  }
  return 'reported fallback'
}
