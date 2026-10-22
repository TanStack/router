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
 * a run page of the test process (`runClient`: a page of the bounded pool
 * of `@tanstack/compiler-test-utils/browser`, held by the run alone, a fresh
 * document per run), which imports the route module from the dev server
 * with real ES module linking, the real Vite client and the framework's
 * refresh runtime, and renders with the real framework's client renderer
 * and the real router. The test's own modules (what the route file imports)
 * are files of the app; the page reads what they record.
 *
 * Laziness is observed through the router's public lazy contract (a route
 * component's `preload()`, a loader call) and the modules the page actually
 * requests from the dev server. Which of them the compilers emitted for the
 * route is told by provenance, never by id or path (SPEC §5.3: whatever its
 * id, wherever it is served from, `/@fs/` and `/node_modules/` included):
 * the dev server observes the router plugin's own `load` and `transform`
 * hooks (`observeEmitted`) and answers the page which requested modules got
 * their code from them; a file the test wrote, a dependency, Vite's client
 * or a refresh runtime gets none. Never by recognising the helper that
 * builds a lazy value (J2.6, §5.8).
 *
 * Hosts are shared by the tests of a test process (across its files, in
 * projects that keep modules across files), one configuration each (target,
 * plugin options, the route's file and id, the app's tsconfig), and leased
 * to one test at a time (`leaseHost`): a test holds the host it wrote a
 * route into until it ends, and a concurrent test of the same configuration
 * gets another host (FINAL-PASS #13, #19). Each `loadRoute` writes its files
 * to the app as a dev server sees an edit (`edit`: written to disk, reported
 * by Vite's watcher, settled on a bounded outcome), and removes the files of
 * the previous route of that host. A route whose host has moved on to
 * another route's files writes its own back before its next page run.
 * Diagnostics are the dev server's merged channel (console, process
 * streams, Vite's logger) since the route's files were written. Free hosts
 * beyond `freeHostLimit` are closed; the others close with the process
 * (their apps are removed when it exits).
 */
import path from 'node:path'
import react from '@vitejs/plugin-react'
import vueJsx from '@vitejs/plugin-vue-jsx'
import solid from 'vite-plugin-solid'
import { parseSync } from 'vite'
import { expect } from 'vitest'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import { currentTest } from '@tanstack/compiler-test-utils/test-scope'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { tanstackRouter } from '../src/vite'
import type { ShippedModule } from '@tanstack/compiler-test-utils/validate-module'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { PageRun } from '@tanstack/compiler-test-utils/browser'
import type { PluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import type { ESTree, Plugin, PluginOption } from 'vite'
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
   * framework's plugin (a host of its own). `compilers`: plugins whose
   * emitted modules count as the compilers' (a harness control standing in
   * for a compiler), right before the router plugin.
   */
  plugins?: {
    before?: Array<PluginOption>
    after?: Array<PluginOption>
    compilers?: Array<PluginOption>
  }
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
   * Directory the app is created in (default this tests directory), e.g.
   * another project root; bare imports resolve from there, so it must be
   * inside this package.
   */
  dir?: string
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
  /**
   * A script the app's page runs before the route module loads, in every
   * page run of the route (as a `<script>` of the page defining globals the
   * route reads); a run's `before` runs after it.
   */
  pageScript?: string
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
 * The dev server's answer to the page: which requested modules the compilers
 * emitted (see `emittedEndpointPlugin`).
 */
const emittedEndpoint = '/__route-app__/emitted'

/**
 * The modules the compilers emitted code for, by environment and module id:
 * for each, the hooks that gave it its code (see `observeEmitted`).
 */
type EmittedModules = Map<string, Set<string>>

const emittedKey = (environment: string, id: string) => `${environment}\0${id}`

/**
 * Observes the hooks of `option` (the router plugin as its public entry
 * point returns it, or a plugin a harness control has stand in for a
 * compiler), in place: a module whose code one of their `load` hooks
 * returned, or whose code one of their `transform` hooks changed, is a
 * module they emitted. The hooks run as before and their results pass
 * through unchanged; nothing of their ids, queries or paths is assumed.
 * Every plugin of the option is observed, however Vite gets it: in nested
 * arrays, as a Promise (the option is returned with each Promise replaced
 * by one that resolves to the same, observed, plugins), or returned by a
 * plugin's `applyToEnvironment` for an environment (FINAL-PASS #49).
 */
function observeEmitted(
  option: PluginOption,
  emitted: EmittedModules,
): PluginOption {
  const record = (
    environment: string,
    id: string,
    hook: string,
    gave: boolean,
  ) => {
    const key = emittedKey(environment, id)
    const hooks = emitted.get(key) ?? new Set<string>()
    if (gave) {
      hooks.add(hook)
    } else {
      hooks.delete(hook)
    }
    emitted.set(key, hooks)
  }
  const environmentOf = (context: unknown, options: unknown) =>
    (context as { environment?: { name?: string } } | undefined)?.environment
      ?.name ??
    ((options as { ssr?: boolean } | undefined)?.ssr ? 'ssr' : 'client')
  const codeOf = (result: unknown) =>
    typeof result === 'string'
      ? result
      : (result as { code?: unknown } | null | undefined)?.code
  const wrap = (
    hook: unknown,
    after: (context: unknown, args: Array<unknown>, result: unknown) => void,
  ) => {
    if (!hook) {
      return hook
    }
    const handler = (
      typeof hook === 'function' ? hook : (hook as { handler: unknown }).handler
    ) as (...args: Array<unknown>) => unknown
    async function observed(this: unknown, ...args: Array<unknown>) {
      const result = await handler.apply(this, args)
      after(this, args, result)
      return result
    }
    return typeof hook === 'function'
      ? observed
      : { ...(hook as object), handler: observed }
  }
  const observed = new WeakSet<object>()
  /** `value`, its plugins observed (a Promise: one resolving to them). */
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        value[index] = visit(item)
      })
      return value
    }
    if (value && typeof (value as { then?: unknown }).then === 'function') {
      return Promise.resolve(value).then(visit)
    }
    if (!value || typeof value !== 'object' || observed.has(value)) {
      return value
    }
    observed.add(value)
    const plugin = value as Plugin
    const name = plugin.name
    // Plugins it returns for an environment (`applyToEnvironment` may
    // return a plugin option instead of a boolean)
    const applyToEnvironment = plugin.applyToEnvironment
    if (typeof applyToEnvironment === 'function') {
      plugin.applyToEnvironment = function (this: unknown, ...args) {
        return visit(applyToEnvironment.apply(this, args)) as ReturnType<
          NonNullable<Plugin['applyToEnvironment']>
        >
      }
    }
    plugin.load = wrap(plugin.load, (context, [id, options], result) => {
      record(
        environmentOf(context, options),
        id as string,
        `${name} load`,
        typeof codeOf(result) === 'string',
      )
    }) as Plugin['load']
    plugin.transform = wrap(
      plugin.transform,
      (context, [code, id, options], result) => {
        const output = codeOf(result)
        record(
          environmentOf(context, options),
          id as string,
          `${name} transform`,
          typeof output === 'string' && output !== code,
        )
      },
    ) as Plugin['transform']
    return plugin
  }
  return visit(option) as PluginOption
}

/**
 * The URL Vite's module graph knows a served module by: decoded, and a
 * virtual module's id out of the `/@id/` form Vite serves it under (`\0`
 * spelled `__x00__`: Vite's documented convention for virtual modules).
 */
function servedId(url: string) {
  const decoded = decodeURI(url).replaceAll('__x00__', '\0')
  return decoded.startsWith('/@id/') ? decoded.slice('/@id/'.length) : decoded
}

/**
 * Answers the page's question (`emittedEndpoint`: a JSON list of requests,
 * path and query) from what `observeEmitted` saw: for each, whether the
 * module the client environment serves for it got its code from the
 * compilers.
 */
function emittedEndpointPlugin(emitted: EmittedModules): Plugin {
  return {
    name: 'route-app:emitted-modules',
    configureServer(server) {
      server.middlewares.use(emittedEndpoint, (request, response) => {
        let body = ''
        request.on('data', (chunk) => {
          body += chunk
        })
        request.on('end', () => {
          const graph = server.environments.client.moduleGraph
          // (answered whatever happens: a request left open would hold one
          // of the page's connections to the dev server)
          Promise.resolve()
            .then(() =>
              Promise.all(
                (JSON.parse(body) as Array<string>).map(async (url) => {
                  const module = await graph.getModuleByUrl(servedId(url))
                  return (
                    module?.id != null &&
                    (emitted.get(emittedKey('client', module.id))?.size ?? 0) >
                      0
                  )
                }),
              ),
            )
            .then(
              (answers) => {
                response.setHeader('content-type', 'application/json')
                response.end(JSON.stringify(answers))
              },
              (error: unknown) => {
                response.statusCode = 500
                response.end(String(error))
              },
            )
        })
      })
    },
  }
}

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

/** Whether the compilers emitted a request, as the dev server observed it. */
const emittedAnswers = new Map<string, boolean>()

/**
 * The requests so far whose modules the compilers emitted (asked of the dev
 * server once per request and document: \`${emittedEndpoint}\`).
 */
async function emitted(requests: Array<string>) {
  const unknown = requests.filter((request) => !emittedAnswers.has(request))
  if (unknown.length > 0) {
    const response = await fetch('${emittedEndpoint}', { method: 'POST', body: JSON.stringify(unknown) })
    if (!response.ok) throw new Error('the dev server could not tell the emitted modules: ' + (await response.text()))
    const answers: Array<boolean> = await response.json()
    unknown.forEach((request, index) => emittedAnswers.set(request, answers[index]!))
  }
  return requests.filter((request) => emittedAnswers.get(request))
}

/**
 * Modules the compilers emitted that the document requested so far, in
 * order (path and query): the route module, and every module the compilers
 * emitted that is not a file of the test as written (\`own\`: their paths).
 */
export async function compiledRequests(routeUrl: string, own: Array<string>): Promise<Array<string>> {
  const owned = new Set(own)
  const requests = [...requestUrls().keys()]
  const emittedRequests = new Set(await emitted(requests))
  return requests.filter((request) => request === routeUrl || (!owned.has(request) && emittedRequests.has(request)))
}

/**
 * App-local modules the document requested so far, in order (path and
 * query): the compiled ones and the files of the test (\`own\`), whatever
 * the query a tool serves them with (e.g. \`/data.json?import\`).
 */
export async function appRequests(routeUrl: string, own: Array<string>): Promise<Array<string>> {
  const owned = new Set(own)
  const compiled = new Set(await compiledRequests(routeUrl, own))
  return [...requestUrls().keys()].filter((request) => compiled.has(request) || owned.has(request.split('?')[0]!))
}

/**
 * The app-local requests so far, each without the timestamp Vite's import
 * analysis adds to imports of a file it hot-updated (\`t=\`), with the URL
 * the page actually requested.
 */
function requestUrls(): Map<string, string> {
  const seen = new Map<string, string>()
  for (const entry of performance.getEntriesByType('resource')) {
    const url = new URL(entry.name)
    if (url.origin !== location.origin) continue
    // Without Vite's HMR timestamp (the t= query, which import analysis adds to
    // imports of a module an edit changed): one request per module
    const actual = url.pathname + url.search
    url.searchParams.delete('t')
    const request = url.pathname + url.search
    if (url.pathname === '/${probeFile}' || url.pathname === '/${entryFile}' || url.pathname === '${emittedEndpoint}') continue
    if (!seen.has(request)) seen.set(request, actual)
  }
  return seen
}

/**
 * The URL to import an app module by to get the instance the page's other
 * modules share: the URL they requested, or the plain one. (The import
 * itself happens in the page's script: Vite rewrites the dynamic imports
 * of the modules it serves.)
 */
export function requestUrl(request: string) {
  return requestUrls().get(request) ?? request
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
}

/**
 * A host of this test process: shared by the tests of one configuration
 * (`hostKey`), one test at a time. The test that holds it (its lease) writes
 * its routes into it; another test needing that configuration meanwhile (a
 * concurrent test) gets a host of its own. A custom host (`fresh`, or
 * `plugins`) serves only the test that created it, and closes when it ends.
 */
interface HostEntry {
  key: string
  custom: boolean
  state: Promise<HostState>
  /** The test holding the host, or `undefined` when it is free. */
  lease: object | undefined
  /** When the host was last given back (to close the least recently used). */
  released: number
}

const hostEntries: Array<HostEntry> = []

/** Free shared hosts a test process keeps for later tests, at most. */
const freeHostLimit = 6

/** The holder of hosts taken outside any test (e.g. in a `beforeAll`). */
const outsideTests = {}

async function closeEntry(entry: HostEntry) {
  const index = hostEntries.indexOf(entry)
  if (index !== -1) {
    hostEntries.splice(index, 1)
  }
  const resolved = await entry.state.catch(() => undefined)
  await resolved?.host.close()
}

/** Gives a host back; closes free hosts beyond `freeHostLimit`. */
async function releaseEntry(entry: HostEntry) {
  entry.lease = undefined
  entry.released = performance.now()
  if (entry.custom) {
    await closeEntry(entry)
    return
  }
  const free = hostEntries
    .filter((candidate) => candidate.lease === undefined && !candidate.custom)
    .sort((a, b) => b.released - a.released)
  for (const extra of free.slice(freeHostLimit)) {
    await closeEntry(extra)
  }
}

/**
 * The host the current test writes a route of configuration `key` into: the
 * one it holds, a free one, or a new one (`start`).
 */
function leaseHost(
  key: string,
  custom: boolean,
  start: () => Promise<HostState>,
): { entry: HostEntry; created: boolean } {
  const test = currentTest()
  const holder = test ?? outsideTests
  const take = (entry: HostEntry) => {
    entry.lease = holder
    test?.onTestFinished(() => releaseEntry(entry))
  }
  if (!custom) {
    const held = hostEntries.find(
      (entry) => entry.key === key && entry.lease === holder,
    )
    if (held) {
      return { entry: held, created: false }
    }
    const free = hostEntries.find(
      (entry) => entry.key === key && entry.lease === undefined,
    )
    if (free) {
      take(free)
      return { entry: free, created: false }
    }
  }
  const entry: HostEntry = {
    key,
    custom,
    state: start(),
    lease: undefined,
    released: 0,
  }
  hostEntries.push(entry)
  take(entry)
  return { entry, created: true }
}

/**
 * The bound of one page run's script: a guard against a run that never
 * settles (e.g. a page left suspended while a navigation is pending), well
 * above what a run takes on a loaded machine.
 */
const pageRunBound = 10_000

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
      dir: options.dir,
      // Vite's watcher does not watch `node_modules`: package stubs are
      // written with the app, so each set of them has its own host
      packages: packageFiles(options.files ?? {}),
      frameworkPluginOptions: options.frameworkPluginOptions,
      // A function option (e.g. `splitBehavior`) by its source: two routes
      // with different functions get different hosts
    },
    (_, value: unknown) =>
      typeof value === 'function' ? `function ${String(value)}` : value,
  )
}

/** The files of `files` that are packages (under `node_modules/`). */
function packageFiles(files: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(files).filter(([file]) => isPackageFile(file)),
  )
}

const isPackageFile = (file: string) => /^(?:\.\/)?node_modules\//.test(file)

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
  const emitted: EmittedModules = new Map()
  const host = await createPluginHost({
    dir: options.dir ?? import.meta.dirname,
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
      emittedEndpointPlugin(emitted),
      ...(options.plugins?.before ?? []),
      observeEmitted(options.plugins?.compilers ?? [], emitted),
      observeEmitted(
        tanstackRouter(routerOptions(options, root, appRoot)),
        emitted,
      ),
      frameworkPlugins[target](options.frameworkPluginOptions),
      ...(options.plugins?.after ?? []),
    ],
  })
  return {
    host,
    current: files,
    owner: undefined,
    used: false,
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
    // Package stubs are the host's own (see `hostKey`)
    for (const file of Object.keys(state.current)) {
      if (!(file in files) && !isPackageFile(file)) {
        edit[file] = null
      }
    }
    for (const [file, code] of Object.entries(files)) {
      if (state.current[file] !== code && !isPackageFile(file)) {
        edit[file] = code
      }
    }
    if (Object.keys(edit).length > 0) {
      await state.host.edit(edit)
    }
  }
  state.current = files
  state.owner = owner
  state.used = true
}

/**
 * The URL each request is imported by from the app's modules: Vite's import
 * analysis adds the time of a file's last hot update (`t=`) to the imports
 * of that file, so that a page importing the plain URL would get a second
 * instance. The page's own script imports by these URLs.
 */
async function stampedUrls(host: PluginHost, requests: Array<string>) {
  const graph = host.dev.vite.environments.client.moduleGraph
  const stamped: Record<string, string> = {}
  for (const request of requests) {
    const module = await graph.getModuleByUrl(request)
    if (module && module.lastHMRTimestamp > 0) {
      stamped[request] =
        `${request}${request.includes('?') ? '&' : '?'}t=${module.lastHMRTimestamp}`
    }
  }
  return stamped
}

/** The page-side names a script runs with (see `RouteApp.run`). */
function prelude(
  routeUrl: string,
  own: Array<string>,
  at: string,
  before: string,
  stamped: Record<string, string>,
) {
  return `const probe = module
const own = new Set(${JSON.stringify(own)})
const routeUrl = ${JSON.stringify(routeUrl)}
/** The URLs the app's own modules import these by (see \`stampedUrls\`). */
const stamped = ${JSON.stringify(stamped)}
const importUrl = (request) => stamped[request] ?? probe.requestUrl(request)
/** Modules the compilers emitted that the page requested so far (path and query; async). */
const compiled = () => probe.compiledRequests(routeUrl, [...own])
/** Every app-local module the page requested so far: compiled ones and the test's files (async). */
const requested = () => probe.appRequests(routeUrl, [...own])
/** An app file the test wrote, as the page imports it (the instance the route gets). */
const app = (file) => import(importUrl('/' + file.replace(/^\\.?\\//, '')))
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
   * wrote, the instance the route gets), `await requested()` and
   * `await compiled()` (requests so far: the compiled ones and the test's
   * files; the modules the compilers emitted only, by provenance),
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
  const owner = {}
  const { entry, created } = leaseHost(hostKey(options, root), custom, () =>
    startHost(options, root, files),
  )
  const state = await entry.state
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
        `${prelude(url, [...own], at, `${options.pageScript ?? ''}\n${runOptions.before ?? ''}`, await stampedUrls(state.host, [...own]))}
// A run that never settles (e.g. a page left suspended while a navigation
// is pending) fails at a bound, instead of holding its page
return await Promise.race([
  (async () => {
${body}
  })(),
  new Promise((_, reject) => setTimeout(() => reject(new Error('the page run did not settle within ${pageRunBound} ms')), ${pageRunBound})),
])`,
      )
    } catch (error) {
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
    run<Array<string>>(`const before = new Set(await compiled())
await trigger(${JSON.stringify(option)})
// A module the option requested that failed to compile is no lazily
// loaded module: the option is broken (fail, never count it as lazy)
probe.assertNoFailedRequests()
return (await compiled()).filter((request) => !before.has(request))`)

  /**
   * The production client build of the app as it is now (`vite build` of the
   * host, source maps on), as `getModuleErrors` reads it (`build`). Its
   * input is the generated route tree, with its export kept, as an app's
   * router reads it: each route's `Route` and what its options load, not
   * the route file's other exports. Its output goes under `node_modules/`,
   * which the dev server's watcher ignores.
   */
  const shipped = async (): Promise<ShippedModule> => {
    await writeRoute(state, owner, files)
    const outDir = path.join(state.host.root, 'node_modules/.route-app-build')
    const built = await state.host.build({
      config: {
        build: {
          outDir,
          emptyOutDir: true,
          sourcemap: true,
          rollupOptions: {
            input: path.join(state.host.root, 'routeTree.gen.ts'),
            preserveEntrySignatures: 'exports-only',
          },
        },
      },
    })
    const client = built.environments.client
    if (!client) {
      throw new Error('the production build has no client environment')
    }
    // A free name counts wherever the build still reads it: code a
    // compiler generates without mappings (§5.14) maps to no file
    return { chunks: client.chunks, outDir: client.outDir }
  }

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
      >(`const before = new Set(await compiled())
await trigger(${JSON.stringify(option)})
probe.assertNoFailedRequests()
const loaded = (await compiled()).filter((request) => !before.has(request))
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
const before = new Set(await compiled())
await trigger(${JSON.stringify(other)})
return (await compiled()).filter((request) => !before.has(request)).length`)
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
    requested: () => run<Array<string>>('return await requested()'),
    eagerModules: () =>
      run<Array<string>>('return Promise.all((await compiled()).map(served))'),
    modules: async () => {
      const found = await run<
        Array<{ request: string; label: string; code: string }>
      >(
        `const found = []
for (const request of await compiled()) {
  found.push({ request, label: request === routeUrl ? 'reference' : 'shared' })
}
for (const option of ${JSON.stringify(splittableOptions)}) {
  if (!options || !(option in options)) continue
  const before = new Set(await compiled())
  await trigger(option)
  for (const request of await compiled()) {
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
      routeSources.set(modules, {
        code,
        filename,
        // Route HMR code runs in dev, on an update, and the production
        // build drops it: a route compiled with HMR keeps the check of the
        // module alone
        shipped:
          options.hmr ||
          options.pluginOptions?.codeSplittingOptions?.addHmr === true
            ? undefined
            : shipped,
      })
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

/**
 * Route file each `modules()` result was compiled from, and the production
 * build of its app (`shipped`).
 */
const routeSources = new WeakMap<
  object,
  {
    code: string
    filename: string
    shipped: (() => Promise<ShippedModule>) | undefined
  }
>()

/**
 * Asserts that every module the compilers emitted for the route is a valid
 * client module as the browser receives it (SPEC G1, G8 at module level):
 * it parses, binds what it reads, and reads no name the route file bound
 * that the module lost (`source` of `getModuleErrors`). The globals the
 * framework's refresh runtime installs in the page are known.
 *
 * A free name (one the module reads but never declares or imports, or a
 * lost binding) is decided on the real production build (G8: code the
 * bundler deletes from the production build may dangle; §5.9): a module
 * with one is checked again against a `vite build` of the same app, and the
 * name counts only if the build's client chunks still read it free
 * (`build` of `getModuleErrors`, without a module: anywhere in the chunks,
 * since generated code may map to no file). The check of the module alone runs
 * first, and the build only when it finds a free name, so a correct
 * compiler costs no build. Parse and binding errors need no build. A route
 * compiled with route HMR (`hmr: true`) keeps the check of the module
 * alone: its HMR code runs in dev on an update, and production drops it.
 */
export async function expectValidModules(
  route: RouteApp | RouteModules['modules'],
) {
  const modules: Record<string, string> = isRouteApp(route)
    ? (await route.modules()).modules
    : route
  const source = routeSources.get(modules)
  const errors: Record<string, Array<string>> = {}
  const check = (code: string, build?: ShippedModule) =>
    // Served code is JavaScript; read with the route file's language, as
    // the `source` comparison needs
    getModuleErrors(code, 'module.tsx', {
      env: 'client',
      source: source?.code,
      globals: refreshGlobals,
      ...(build && { build }),
    })
  for (const [name, code] of Object.entries(modules)) {
    errors[name] = await check(code)
  }
  if (
    source?.shipped &&
    Object.values(errors).some((found) => found.length > 0)
  ) {
    const build = await source.shipped()
    for (const [name, code] of Object.entries(modules)) {
      if (errors[name]!.length > 0) {
        errors[name] = await check(code, build)
      }
    }
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
 * escaping), for D5 checks that user code is absent from a module. Throws
 * on code that does not parse: an absence check on it would prove nothing.
 */
export function stringValues(
  code: string,
  filename = 'module.js',
): Set<string> {
  const { program, errors } = parseSync(filename, code, {
    sourceType: 'module',
  })
  if (errors.length > 0) {
    throw new Error(
      `cannot read the string values of a module that does not parse (${errors.map((error) => error.message).join('; ')}):\n${code}`,
    )
  }
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

/**
 * The warnings and errors a page run logged (`PageRun.console`, `type: text`)
 * as diagnostics of the `page` channel: what a developer reads in the
 * browser's console (e.g. a warning a served module prints when it loads).
 * Merge them with `route.diagnostics()` to read every channel.
 */
export function pageDiagnostics(
  console: Array<string>,
): Array<ChannelDiagnostic> {
  const severities: Record<string, 'warning' | 'error'> = {
    warning: 'warning',
    error: 'error',
  }
  return console.flatMap((line) => {
    const separator = line.indexOf(': ')
    const severity = severities[line.slice(0, separator)]
    return severity
      ? [
          {
            severity,
            text: line.slice(separator + 2),
            raw: line,
            source: 'page' as const,
          },
        ]
      : []
  })
}
