/**
 * A route file loaded the way an app loads it (SYNTHESIS recipe P1;
 * RULES-AUDIT R3, R23–R25): the public composed `tanstackRouter` plugin and
 * the framework's own Vite plugin run in a real Vite dev server
 * (`@tanstack/compiler-test-utils/plugin-host`), on an app written to disk
 * (`__root.tsx`, the route file, the files the test gives). The router
 * plugin's own route generator registers the route (a virtual route config
 * naming the route file: the public `virtualRouteConfig` option), so nothing
 * of the compiler is assumed: no hook placement, no recorder, no module id,
 * query or registration.
 *
 * Client semantics run in a real browser: every check is a script run in
 * the shared Chromium page (`runClient`, one page per test process, a fresh
 * document per run), which imports the route module from the dev server
 * with real ES module linking, the real Vite client and the framework's
 * refresh runtime, and renders with the real framework's client renderer
 * and the real router. The test's own modules (what the route file imports)
 * are files of the app; the page reads what they record.
 *
 * Laziness is observed through the router's public lazy contract (a route
 * component's `preload()`, a loader call) and the modules the page actually
 * requests from the dev server: a module the page requests that is neither
 * a file the test wrote, a dependency nor a module of the tools (Vite's
 * client, a refresh runtime) is a module the compilers emitted for the route
 * (SPEC §5.3: whatever its id). Never by recognising the helper that builds
 * a lazy value (J2.6, §5.8).
 *
 * Hosts are shared within a test file, one per configuration (target,
 * plugin options, the route's file and id, the app's tsconfig): each
 * `loadRoute` writes its files to the app as a dev server sees an edit
 * (`edit`: written to disk, reported by Vite's watcher, settled on a bounded
 * outcome), and removes the files of the previous route of that host. A
 * route whose host has moved on to another route's files writes its own
 * back before its next page run. Diagnostics are the dev server's merged
 * channel (console, process streams, Vite's logger) since the route's files
 * were written.
 */
import path from 'node:path'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { parseSync } from 'vite'
import { afterAll, expect } from 'vitest'
import { runInPage } from '@tanstack/compiler-test-utils/browser'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { tanstackRouter } from '../src/vite'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { PageRun } from '@tanstack/compiler-test-utils/browser'
import type { PluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import type { ESTree, PluginOption } from 'vite'
import type { Config, DeletableNodes } from '../src'

/** A framework the router plugin targets. */
export type TargetFramework = 'react' | 'solid' | 'vue'

export interface RouteAppOptions {
  /** Default `react`. */
  targetFramework?: TargetFramework
  /**
   * Path of the route file in the app (default `route.tsx`); its extension
   * gives its language.
   */
  filename?: string
  /**
   * Route id the route file is registered under (default `/`, an index
   * route under the root). A route file creating a root route
   * (`createRootRoute`, `createRootRouteWithContext`) is the app's root.
   */
  routeId?: string
  /**
   * Compile for route HMR (`codeSplittingOptions.addHmr`, default `false`
   * here: the dev server's own default is `true`).
   */
  hmr?: boolean
  /**
   * Route options removed from the output, as Start configures the client
   * (`['ssr', 'server', 'headers']`).
   */
  deleteNodes?: Array<DeletableNodes>
  /**
   * Router plugin options over the harness's (`target`, `autoCodeSplitting:
   * true`, the virtual route config, `codeSplittingOptions` merged with
   * `hmr` and `deleteNodes`).
   */
  pluginOptions?: Partial<Config>
  /**
   * Other Vite plugins, before and after the router plugin and the
   * framework's plugin (a host of its own).
   */
  plugins?: { before?: Array<PluginOption>; after?: Array<PluginOption> }
  /**
   * The other files of the app (what the route file imports), by path
   * relative to the app root (the route file's directory by default):
   * `{ 'config.ts': 'export const …' }` for `import … from './config'`.
   */
  files?: Record<string, string>
  /**
   * `compilerOptions` of the app's `tsconfig.json` over the default
   * (`verbatimModuleSyntax: true`): what Vite's TypeScript transform reads,
   * e.g. `experimentalDecorators`, `jsx`.
   */
  tsconfig?: Record<string, unknown>
  /** A host of its own (a fresh dev server), not shared with other routes. */
  fresh?: boolean
  /**
   * Other dependencies the app imports that the page needs pre-bundled, as
   * Vite pre-bundles an app's installed dependencies (e.g. a CommonJS
   * package, or `@emotion/react` and its JSX runtimes).
   */
  prebundle?: Array<string>
  /**
   * Options of the framework's own Vite plugin, as an app gives them (e.g.
   * `{ jsxRuntime: 'classic' }` for `@vitejs/plugin-react`: a project whose
   * JSX runtime is classic).
   */
  frameworkPluginOptions?: Record<string, unknown>
}

/** Route options the code splitter may split. */
export const splittableOptions = [
  'component',
  'errorComponent',
  'pendingComponent',
  'notFoundComponent',
  'loader',
]

/** Dependencies the app imports, pre-bundled up front as Vite does for an app. */
const prebundled: Record<TargetFramework, Array<string>> = {
  react: [
    'react',
    'react/jsx-runtime',
    'react/jsx-dev-runtime',
    'react-dom',
    'react-dom/client',
    '@tanstack/react-router',
  ],
  solid: [
    'solid-js',
    'solid-js/web',
    'solid-js/store',
    '@tanstack/solid-router',
  ],
  vue: ['vue', '@tanstack/vue-router'],
}

/** The framework's own Vite plugin, as an app adds it. */
const frameworkPlugins: Record<
  TargetFramework,
  (options?: Record<string, unknown>) => PluginOption
> = {
  react: (options) => react(options),
  solid: (options) => solid(options),
  vue: (options) => vueJsx(options),
}

/** The page-side helper module every app holds (see `probeSource`). */
export const probeFile = 'route-app-probe.ts'

/**
 * The app module the page imports the route module through, as the app's
 * own modules import it (the route tree does): after an edit, Vite's import
 * analysis gives every import of the edited module its HMR timestamp, so
 * the split chunks import `/route.tsx?t=…`; a page importing
 * `/route.tsx` itself would get a second instance of the route module.
 */
export const entryFile = 'route-app-entry.ts'

const entrySource = (filename: string) =>
  `export * as route from './${filename.replace(/^\.\//, '')}'\n`

/**
 * Tool modules the page loads that no compiler emitted for the route: Vite's
 * client and its environment, the refresh runtimes, dependencies (pre-bundled
 * or served from `node_modules`), the plugin host's page.
 */
const toolModule =
  /^\/(?:@vite\/|@react-refresh|@solid-refresh|@vue\/|@fs\/|node_modules\/|__plugin-host__\/|@id\/(?:__x00__)?(?:solid-refresh|vite\/))/

/**
 * The framework part of the page helper: `mount(target, el)` renders a
 * component or the router into `el` with the framework's client renderer
 * and throws what rendering threw; `element(component, props)`.
 */
const frameworkProbe: Record<TargetFramework, string> = {
  react: `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
export { RouterProvider, createMemoryHistory, createRouter }
export function mount(component: any, props: Record<string, unknown>, el: HTMLElement, caught: boolean) {
  const errors: Array<unknown> = []
  const root = createRoot(el, {
    onUncaughtError: (error) => errors.push(error),
    onRecoverableError: (error) => errors.push(error),
    ...(caught ? {} : { onCaughtError: (error: unknown) => errors.push(error) }),
  })
  flushSync(() => root.render(createElement(component, props)))
  return { errors, unmount: () => root.unmount() }
}
`,
  solid: `import { createComponent } from 'solid-js'
import { render } from 'solid-js/web'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/solid-router'
export { RouterProvider, createMemoryHistory, createRouter }
export function mount(component: any, props: Record<string, unknown>, el: HTMLElement) {
  const errors: Array<unknown> = []
  let unmount = () => {}
  try {
    unmount = render(() => createComponent(component, props), el)
  } catch (error) {
    errors.push(error)
  }
  return { errors, unmount }
}
`,
  vue: `import { createApp, h } from 'vue'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/vue-router'
export { RouterProvider, createMemoryHistory, createRouter }
export function mount(component: any, props: Record<string, unknown>, el: HTMLElement) {
  const errors: Array<unknown> = []
  const app = createApp({ render: () => h(component, props) })
  app.config.errorHandler = (error) => {
    errors.push(error)
  }
  app.config.warnHandler = () => {}
  try {
    app.mount(el)
  } catch (error) {
    errors.push(error)
  }
  return { errors, unmount: () => app.unmount() }
}
`,
}

/**
 * The page-side helper: request observation (resource timing of the
 * document), option triggers, rendering of a component or of the app
 * through the generated route tree and the real router.
 */
function probeSource(framework: TargetFramework) {
  return `${frameworkProbe[framework]}
performance.setResourceTimingBufferSize(1_000_000)
const tool = ${toolModule}

/** App-local modules the document requested so far, in order (path and query). */
export function appRequests(): Array<string> {
  const seen = new Set<string>()
  for (const entry of performance.getEntriesByType('resource')) {
    const url = new URL(entry.name)
    if (url.origin !== location.origin) continue
    // Without Vite's HMR timestamp (the t= query, which import analysis adds to
    // imports of a module an edit changed): one request per module
    url.searchParams.delete('t')
    const request = url.pathname + url.search
    if (tool.test(request) || url.pathname === '/${probeFile}' || url.pathname === '/${entryFile}') continue
    seen.add(request)
  }
  return [...seen]
}

/** Starts loading a route option as the router does (errors ignored). */
export async function trigger(route: any, option: string) {
  const value = route?.options?.[option]
  try {
    if (option === 'loader') {
      const loader = typeof value === 'function' ? value : value?.handler
      if (typeof loader === 'function') await loader()
      return
    }
    await value?.preload?.()
  } catch {}
}

/**
 * Throws when a module of the app the document requested failed (an HTTP
 * error: the dev server could not compile it). The router hides a failed
 * route chunk until it renders the lazy component, and then reloads the
 * page once (as after a deployment): rendering it would navigate the page
 * away from the run instead of failing it.
 */
export function assertNoFailedRequests() {
  const failed = performance
    .getEntriesByType('resource')
    .filter((entry: any) => entry.responseStatus >= 400)
    .map((entry: any) => \`\${new URL(entry.name).pathname}\${new URL(entry.name).search} (HTTP \${entry.responseStatus})\`)
  if (failed.length > 0) throw new Error(\`a module of the app failed to load: \${failed.join(', ')}\`)
}

/** The option as the router uses it, once its module loaded. */
export async function load(route: any, option: string) {
  const value = route.options[option]
  if (option !== 'loader') await value?.preload?.()
  assertNoFailedRequests()
  return value
}

function settled(el: HTMLElement, isIdle: () => boolean, timeout: number) {
  return new Promise<void>((resolve) => {
    const deadline = performance.now() + timeout
    let last = el.innerHTML
    let stable = 0
    const check = () => {
      const now = el.innerHTML
      stable = now === last && isIdle() ? stable + 1 : 0
      last = now
      if (stable >= 3 || performance.now() > deadline) resolve()
      else setTimeout(check, 10)
    }
    setTimeout(check, 0)
  })
}

/** Renders a component with the framework's client renderer: its HTML. */
export async function renderComponent(component: any, props: Record<string, unknown> = {}) {
  assertNoFailedRequests()
  const el = document.createElement('div')
  document.body.append(el)
  const { errors, unmount } = mount(component, props, el, false)
  if (errors.length > 0) throw errors[0]
  await settled(el, () => true, 200)
  const html = el.innerHTML
  unmount()
  el.remove()
  return html
}

/**
 * Renders the app at \`at\`: the generated route tree, the real router
 * (memory history), \`router.load()\`, then \`RouterProvider\`.
 */
export async function renderRoute(at: string, routerOptions: Record<string, unknown> = {}) {
  // Imported by its URL when the app renders, not linked when this helper
  // loads: a run that renders no route does not depend on the route tree
  // (which a generator that rejects the route file never writes)
  const routeTreeUrl = '/routeTree.gen.ts'
  const { routeTree } = await import(/* @vite-ignore */ routeTreeUrl)
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [at] }),
    ...routerOptions,
  })
  await router.load()
  assertNoFailedRequests()
  const el = document.createElement('div')
  document.body.append(el)
  const { errors } = mount(RouterProvider, { router }, el, true)
  if (errors.length > 0) throw errors[0]
  await settled(el, () => router.state.status === 'idle' && !router.state.isLoading, 3000)
  return { html: el.innerHTML, router }
}
`
}

/** The app's root route, when the route file is not the root. */
const rootRoute = (target: TargetFramework) =>
  `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`

/** Whether a route file creates a root route (it is then the app's root). */
const createsRootRoute = (code: string) =>
  /\bcreateRootRoute(?:WithContext)?\s*[(<]/.test(code)

/** URL of an app file (relative to the app root). */
export const appUrl = (file: string) =>
  `/${file.replace(/^\.\//, '').replaceAll('\\', '/')}`

interface HostState {
  host: PluginHost
  /** Files the current route wrote (other than the fixed ones), by path. */
  current: Record<string, string>
  /** The route whose files the app holds now. */
  owner: object | undefined
  used: boolean
  /** Closes the idle HMR client (see `idleHmrClient`). */
  closeIdle: () => void
}

const hosts = new Map<string, Promise<HostState>>()
afterAll(async () => {
  const all = [...hosts.values()]
  hosts.clear()
  for (const state of all) {
    const resolved = await state.catch(() => undefined)
    resolved?.closeIdle()
    await resolved?.host.close()
  }
})

/**
 * Connects an idle HMR client (as a second tab of the app would be) for the
 * host's lifetime. Vite keeps a full reload (or an error) sent while no
 * client is connected and hands it to the next client that connects: the
 * page of the next run, which would then reload under the run. With a
 * client always connected, what an edit sends while no page runs reaches
 * this one, which ignores it.
 */
async function idleHmrClient(serverUrl: string): Promise<() => void> {
  const socket = new WebSocket(serverUrl.replace(/^http/, 'ws'), 'vite-hmr')
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('message', () => resolve(), { once: true })
    socket.addEventListener('error', () =>
      reject(new Error(`no HMR connection to ${serverUrl}`)),
    )
  })
  return () => socket.close()
}

/** The bound of one page run's script (below Vitest's default test timeout). */
const pageRunBound = 4000

/** Removes the shared page's document, so that it no longer follows a host. */
async function parkPage() {
  await runInPage({ pageUrl: 'about:blank', script: 'return null' })
}

/**
 * Parks the shared page after a failed run: what failed may have started a
 * navigation of the page (the router reloads the page once when a lazy
 * route chunk fails to load, as after a deployment), which would interrupt
 * the next run's own navigation. Retries until a park completes.
 */
async function recoverPage() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await parkPage()
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }
}

function hostKey(options: RouteAppOptions, root: boolean) {
  return JSON.stringify(
    {
      target: options.targetFramework ?? 'react',
      filename: options.filename ?? 'route.tsx',
      routeId: options.routeId ?? '/',
      root,
      hmr: options.hmr ?? false,
      deleteNodes: options.deleteNodes,
      pluginOptions: options.pluginOptions,
      tsconfig: options.tsconfig,
      prebundle: options.prebundle,
      frameworkPluginOptions: options.frameworkPluginOptions,
      // A function option (e.g. `splitBehavior`) by its source: two routes
      // with different functions get different hosts
    },
    (_, value: unknown) =>
      typeof value === 'function' ? `function ${String(value)}` : value,
  )
}

/** The router plugin's options for a route app. */
function routerOptions(
  options: RouteAppOptions,
  root: boolean,
  appRoot: string,
): Partial<Config> {
  const target = options.targetFramework ?? 'react'
  const filename = options.filename ?? 'route.tsx'
  const routeId = options.routeId ?? '/'
  const pluginOptions = options.pluginOptions ?? {}
  return {
    target,
    routesDirectory: '.',
    generatedRouteTree: './routeTree.gen.ts',
    // The generator renames its temporary files into place: on the app's
    // device
    tmpDir: path.join(appRoot, '.tanstack/tmp'),
    disableLogging: true,
    virtualRouteConfig: root
      ? { type: 'root', file: filename, children: [] }
      : {
          type: 'root',
          file: '__root.tsx',
          children: [
            routeId === '/'
              ? { type: 'index', file: filename }
              : { type: 'route', path: routeId, file: filename },
          ],
        },
    autoCodeSplitting: true,
    ...pluginOptions,
    codeSplittingOptions: {
      addHmr: options.hmr ?? false,
      ...(options.deleteNodes && { deleteNodes: options.deleteNodes }),
      ...pluginOptions.codeSplittingOptions,
    },
  } as Partial<Config>
}

async function startHost(
  options: RouteAppOptions,
  root: boolean,
  files: Record<string, string>,
): Promise<HostState> {
  const target = options.targetFramework ?? 'react'
  const host = await createPluginHost({
    dir: import.meta.dirname,
    prefix: '.route-app-',
    files: {
      'tsconfig.json': JSON.stringify({
        compilerOptions: { verbatimModuleSyntax: true, ...options.tsconfig },
      }),
      ...(root ? {} : { '__root.tsx': rootRoute(target) }),
      [probeFile]: probeSource(target),
      [entryFile]: entrySource(options.filename ?? 'route.tsx'),
      ...files,
    },
    client: true,
    config: {
      optimizeDeps: {
        noDiscovery: true,
        include: [...prebundled[target], ...(options.prebundle ?? [])],
      },
    },
    plugins: ({ root: appRoot }) => [
      ...(options.plugins?.before ?? []),
      tanstackRouter(routerOptions(options, root, appRoot)),
      frameworkPlugins[target](options.frameworkPluginOptions),
      ...(options.plugins?.after ?? []),
    ],
  })
  return {
    host,
    current: files,
    owner: undefined,
    used: false,
    closeIdle: await idleHmrClient(host.dev.url!),
  }
}

/**
 * Writes the files of a route into its host's app (an edit, as a dev
 * server sees one), removing the files of the route the app held before.
 */
async function writeRoute(
  state: HostState,
  owner: object,
  files: Record<string, string>,
) {
  if (state.owner === owner) {
    return
  }
  if (state.owner !== undefined || state.used) {
    const edit: Record<string, string | null> = {}
    for (const file of Object.keys(state.current)) {
      if (!(file in files)) {
        edit[file] = null
      }
    }
    for (const [file, code] of Object.entries(files)) {
      if (state.current[file] !== code) {
        edit[file] = code
      }
    }
    await recoverPage()
    if (Object.keys(edit).length > 0) {
      await state.host.edit(edit)
    }
  }
  state.current = files
  state.owner = owner
  state.used = true
}

/** The page-side names a script runs with (see `RouteApp.run`). */
function prelude(
  routeUrl: string,
  own: Array<string>,
  at: string,
  before: string,
) {
  return `const probe = module
const own = new Set(${JSON.stringify(own)})
const routeUrl = ${JSON.stringify(routeUrl)}
/** Modules the compilers emitted that the page requested so far (path and query). */
const compiled = () => probe.appRequests().filter((request) => request === routeUrl || !own.has(request))
/** Every app-local module the page requested so far: compiled ones and the test's files. */
const requested = () => probe.appRequests()
/** An app file the test wrote, as the page imports it (the instance the route gets). */
const app = (file) => import(${JSON.stringify('/')} + file.replace(/^\\.?\\//, ''))
${before}
const exports = (await import(${JSON.stringify(`/${entryFile}`)})).route
const Route = exports.Route
const options = Route?.options
const trigger = (option) => probe.trigger(Route, option)
const load = (option) => probe.load(Route, option)
const renderComponent = (component, props) => probe.renderComponent(component, props)
const render = async (option, props) => probe.renderComponent(await probe.load(Route, option), props)
const renderRoute = async (input = {}) => (await probe.renderRoute(input.at ?? ${JSON.stringify(at)}, input.router)).html
/** Code of a module as the dev server serves it to the page. */
const served = async (request) => (await fetch(request)).text()
`
}

export interface RouteModules {
  /**
   * Code of each module the compilers emitted for the route, as the dev
   * server serves it, by label: `reference` (the route module), `shared`
   * (another module loading with it), `lazy <option>` (a module that loads
   * when the option loads, labelled by the first option, in
   * `splittableOptions` order, whose loading requests it).
   */
  modules: Record<string, string>
  /** The request (path and query) of each label. */
  ids: Record<string, string>
}

export interface RouteApp {
  /** The route's host (its dev server and app). */
  host: PluginHost
  /** Request of the route module (`/route.tsx`). */
  url: string
  /** The route file as written. */
  code: string
  /**
   * Runs `body` (an async function body) in a fresh document of the shared
   * page and returns its JSON value. In scope: `exports` and `Route` (the
   * route module and its route, imported from the dev server), `options`,
   * `trigger(option)`, `load(option)` (a component after `preload()`),
   * `render(option, props?)` and `renderComponent(component, props?)` (the
   * framework's client renderer: the HTML), `renderRoute({ at?, router? })`
   * (the app at `at`, default the route's path, through the generated route
   * tree and the real router: the HTML), `app(file)` (an app file the test
   * wrote, the instance the route gets), `requested()` and `compiled()`
   * (requests so far: every app-local one, the compilers' modules only),
   * `served(request)`. `before` runs before the route module is imported
   * (e.g. to set a global the route reads).
   */
  run: <T = unknown>(body: string, options?: { before?: string }) => Promise<T>
  /** `run`, with the page's errors and console. */
  runPage: <T = unknown>(
    body: string,
    options?: { before?: string },
  ) => Promise<PageRun<T>>
  /**
   * Whether loading the option (its public trigger, awaited) requests a
   * module the compilers emitted that did not load with the route module.
   */
  isLazy: (option: string) => Promise<boolean>
  /**
   * Code of each module the compilers emitted that loading the option
   * requests (one or more: facades and support modules are allowed); fails
   * for an option that is not lazy.
   */
  loadedBy: (option: string) => Promise<Array<string>>
  /**
   * The lazy options grouped by what loads together: once an option
   * loaded, loading every other option of its group requests nothing new
   * (each pair observed in a fresh document). Groups sorted, each sorted.
   */
  groups: () => Promise<Array<Array<string>>>
  /**
   * Every app-local module loading the route module requests (compiled
   * modules and the test's files), as requests (`/config.ts`).
   */
  requested: () => Promise<Array<string>>
  /** Code of the compiled modules that load with the route module. */
  eagerModules: () => Promise<Array<string>>
  /** The modules the compilers emitted for the route (see `RouteModules`). */
  modules: () => Promise<RouteModules>
  /**
   * The route module (or another request) as the dev server serves it to
   * the client, without a page: rejects with the error compiling it threw.
   */
  transform: (request?: string) => Promise<string>
  /**
   * What the dev server reported since the route's files were written, on
   * every channel, once its work is done.
   */
  diagnostics: () => Promise<Array<ChannelDiagnostic>>
}

/**
 * Writes a route file (and `options.files`) into a route app and returns
 * the route, loaded on demand by page runs (see the module comment).
 */
export async function loadRoute(
  code: string,
  options: RouteAppOptions = {},
): Promise<RouteApp> {
  const filename = options.filename ?? 'route.tsx'
  const root = createsRootRoute(code)
  const files = { ...options.files, [filename]: code }
  const own = new Set(Object.keys(options.files ?? {}).map(appUrl))
  own.add(appUrl(probeFile))
  own.add(appUrl(entryFile))
  if (!root) {
    own.add(appUrl('__root.tsx'))
  }
  const url = appUrl(filename)
  const at = root ? '/' : (options.routeId ?? '/')

  const custom = options.fresh || options.plugins !== undefined
  const key = hostKey(options, root)
  let statePromise = custom ? undefined : hosts.get(key)
  const owner = {}
  let created = false
  if (!statePromise) {
    statePromise = startHost(options, root, files)
    created = true
    hosts.set(custom ? `${key}#${hosts.size}` : key, statePromise)
  }
  const state = await statePromise
  const mark = created ? 0 : state.host.diagnostics.length
  if (created) {
    state.current = files
    state.owner = owner
    state.used = true
  } else {
    await writeRoute(state, owner, files)
  }

  const runPage = async <T>(
    body: string,
    runOptions: { before?: string } = {},
  ) => {
    await writeRoute(state, owner, files)
    const hmr = state.host.dev.hmr.length
    try {
      return await state.host.runClient<T>(
        appUrl(probeFile),
        `${prelude(url, [...own], at, runOptions.before ?? '')}
// A run that never settles (e.g. a page left suspended while a navigation
// is pending) fails at a bound, instead of holding the shared page
return await Promise.race([
  (async () => {
${body}
  })(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('the page run did not settle within ${pageRunBound} ms')), ${pageRunBound})),
])`,
      )
    } catch (error) {
      await recoverPage()
      const sent = state.host.dev.hmr
        .slice(hmr)
        .map((message) => `${message.type} ${message.paths.join(', ')}`)
      throw new Error(
        `${(error as Error).message}\nHMR messages the dev server sent meanwhile:\n${sent.join('\n') || '(none)'}`,
        { cause: error },
      )
    }
  }
  const run = async <T>(body: string, runOptions?: { before?: string }) =>
    (await runPage<T>(body, runOptions)).result

  const newlyCompiled = (option: string) =>
    run<Array<string>>(`const before = new Set(compiled())
await trigger(${JSON.stringify(option)})
return compiled().filter((request) => !before.has(request))`)

  const route: RouteApp = {
    host: state.host,
    url,
    code,
    run,
    runPage,
    isLazy: async (option) => (await newlyCompiled(option)).length > 0,
    loadedBy: async (option) => {
      const loaded = await run<
        Array<string>
      >(`const before = new Set(compiled())
await trigger(${JSON.stringify(option)})
const loaded = compiled().filter((request) => !before.has(request))
return Promise.all(loaded.map(served))`)
      if (loaded.length === 0) {
        throw new Error(`\`${option}\` loads no module of the route lazily`)
      }
      return loaded
    },
    groups: async () => {
      const present = await run<Array<string>>(
        `return ${JSON.stringify(splittableOptions)}.filter((option) => options && option in options)`,
      )
      const lazy: Array<string> = []
      for (const option of present) {
        if ((await newlyCompiled(option)).length > 0) {
          lazy.push(option)
        }
      }
      const groups = new Map<string, Array<string>>()
      for (const option of lazy) {
        const group = [option]
        for (const other of lazy) {
          if (other === option) {
            continue
          }
          const added =
            await run<number>(`await trigger(${JSON.stringify(option)})
const before = new Set(compiled())
await trigger(${JSON.stringify(other)})
return compiled().filter((request) => !before.has(request)).length`)
          if (added === 0) {
            group.push(other)
          }
        }
        group.sort()
        groups.set(group.join('\0'), group)
      }
      return [...groups.values()].sort((a, b) =>
        a.join(',').localeCompare(b.join(',')),
      )
    },
    requested: () => run<Array<string>>('return requested()'),
    eagerModules: () =>
      run<Array<string>>('return Promise.all(compiled().map(served))'),
    modules: async () => {
      const found = await run<
        Array<{ request: string; label: string; code: string }>
      >(
        `const found = []
for (const request of compiled()) {
  found.push({ request, label: request === routeUrl ? 'reference' : 'shared' })
}
for (const option of ${JSON.stringify(splittableOptions)}) {
  if (!options || !(option in options)) continue
  const before = new Set(compiled())
  await trigger(option)
  for (const request of compiled()) {
    if (!before.has(request)) found.push({ request, label: 'lazy ' + option })
  }
}
return Promise.all(found.map(async (module) => ({ ...module, code: await served(module.request) })))`,
      )
      const modules: Record<string, string> = {}
      const ids: Record<string, string> = {}
      for (const module of found) {
        const label =
          module.label in modules
            ? `${module.label} (${module.request})`
            : module.label
        modules[label] = module.code
        ids[label] = module.request
      }
      routeSources.set(modules, { code, filename })
      return { modules, ids }
    },
    transform: async (request = url) => {
      await writeRoute(state, owner, files)
      return state.host.transform(request, 'client')
    },
    diagnostics: async () => {
      await state.host.dev.idle()
      return state.host.diagnostics.slice(mark)
    },
  }
  return route
}

function isRouteApp(value: unknown): value is RouteApp {
  return typeof (value as RouteApp).run === 'function'
}

/** Route file each `modules()` result was compiled from. */
const routeSources = new WeakMap<object, { code: string; filename: string }>()

/**
 * Asserts that every module the compilers emitted for the route is a valid
 * client module as the browser receives it (SPEC G1, G8 at module level):
 * it parses, binds what it reads, and reads no name the route file bound
 * that the module lost (`source` of `getModuleErrors`). The globals the
 * framework's refresh runtime installs in the page are known.
 */
export async function expectValidModules(
  route: RouteApp | RouteModules['modules'],
) {
  const modules: Record<string, string> = isRouteApp(route)
    ? (await route.modules()).modules
    : route
  const source = routeSources.get(modules)
  const errors: Record<string, Array<string>> = {}
  for (const [name, code] of Object.entries(modules)) {
    // Served code is JavaScript; read with the route file's language, as
    // the `source` comparison needs
    errors[name] = await getModuleErrors(code, 'module.tsx', {
      env: 'client',
      source: source?.code,
      globals: refreshGlobals,
    })
  }
  expect(errors).toEqual(
    Object.fromEntries(Object.keys(modules).map((name) => [name, []])),
  )
}

/** Globals the refresh runtimes install in the page for the modules they compile. */
const refreshGlobals = ['$RefreshReg$', '$RefreshSig$']

/**
 * The decoded values of the string literals and template quasis of a module
 * (an independent parse: a user marker is found whatever its quoting or
 * escaping), for D5 checks that user code is absent from a module.
 */
export function stringValues(
  code: string,
  filename = 'module.js',
): Set<string> {
  const { program } = parseSync(filename, code, { sourceType: 'module' })
  const values = new Set<string>()
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return
    }
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const value = node as ESTree.Node & Record<string, unknown>
    if (value.type === 'Literal' && typeof value.value === 'string') {
      values.add(value.value)
    } else if (value.type === 'TemplateElement') {
      const cooked = (value.value as { cooked?: string | null }).cooked
      if (typeof cooked === 'string') {
        values.add(cooked)
      }
    } else if (value.type === 'JSXText') {
      values.add(String(value.value))
    }
    for (const key of Object.keys(value)) {
      if (key !== 'type' && key !== 'start' && key !== 'end') {
        visit(value[key])
      }
    }
  }
  visit(program)
  return values
}

/** Whether a module holds the user marker `marker` (a decoded string value). */
export function holdsMarker(code: string, marker: string) {
  for (const value of stringValues(code)) {
    if (value.includes(marker)) {
      return true
    }
  }
  return false
}

export const head = `import { createFileRoute } from '@tanstack/react-router'\n`
