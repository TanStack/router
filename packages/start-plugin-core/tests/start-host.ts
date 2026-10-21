/**
 * The public Start host of the fast tier (SYNTHESIS recipe P2): a Start app
 * on disk, served by a real Vite dev server running the plugins a user
 * configures, `tanstackStart()` of the built `@tanstack/<framework>-start`
 * package (its `plugin/vite` export) and the framework's own Vite plugin
 * (`@vitejs/plugin-react`, `vite-plugin-solid`), through the public plugin
 * host of `@tanstack/compiler-test-utils/plugin-host`. Nothing of the
 * compiler is named: no class, module id, query, virtual module, report or
 * emitted helper. Everything a test reads is what the app gives a user:
 *
 * - client code runs in a real Chromium page of the dev server (`client`):
 *   the page imports the case module as a browser imports any module of the
 *   app, and calling a server fn there sends Start's real request to the
 *   dev server, whose real server entry and resolver run the handler;
 * - server code: the case module evaluated by the SSR environment's own
 *   module runner (`ssr`), and server fns called the way server code calls
 *   them, inside a real request of the app (`inRequest`: a server route of
 *   the app runs the callback, so Start's request context is the real one);
 * - served code (`served`): what an environment serves for a case file, for
 *   checks of shipped text (a server-only marker string, a directive);
 * - loads (`loads`): the case files and packages a client import reaches, as
 *   the browser requested them and as Vite's own client module graph
 *   resolved them (static and dynamic imports);
 * - diagnostics: the dev server's merged channel (console, process streams,
 *   Vite's logger), and the error a failed transform throws.
 *
 * One host serves many cases. A case is a directory `src/cases/c<n>` of the
 * app with its own files (`module.tsx` and its relative imports): new URLs
 * for every case, so module instances never carry over from one case to
 * another. The watcher ignores the case directories (they are written once,
 * before anything requests them), so writing a case never reloads the page.
 * Cases that need dev edits write their files with `edit`, which goes
 * through the watcher and the dev server's bounded settle.
 *
 * Use `useStartHost(options)` in a test file: one host per file (taken in
 * `beforeAll`, given back in `afterAll`: a later file of the same test
 * process with the same plain options reuses it, see `freeHosts`), and
 * `host().case(files)` per test. Page runs of concurrent tests each hold
 * one of the host's pages (`hostPageLimit`).
 */
import { realpathSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import solid from 'vite-plugin-solid'
import { resolveModulePath } from 'exsolve'
import { mergeConfig, preview as vitePreview } from 'vite'
import { afterAll, beforeAll, expect } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { globalTrapSource } from '@tanstack/compiler-test-utils/global-trap'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
import {
  inProbeRequest,
  probeRoute,
  probeRouteFile,
  rootRouteFile,
  routerFile,
} from './request-probe'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type {
  HostBuild,
  PluginHost,
} from '@tanstack/compiler-test-utils/plugin-host'
import type { InlineConfig, Plugin, PluginOption, PreviewServer } from 'vite'

/** The Start framework packages a host can serve. */
export type StartFramework = 'react' | 'solid' | 'vue'

/**
 * The options of `tanstackStart()` (`TanStackStartViteInputConfig`, the
 * documented Start plugin options), as a test passes them.
 */
export type StartPluginOptions = Record<string, unknown>

export interface StartHostOptions {
  /** Default `react`. */
  framework?: StartFramework
  /** Options of `tanstackStart(options)`. */
  start?: StartPluginOptions
  /**
   * The app's other Vite plugins, after Start's and the framework's (e.g. a
   * user plugin serving virtual modules), or a function of the app.
   */
  plugins?:
    | Array<PluginOption>
    | ((app: {
        root: string
        command: 'serve' | 'build'
      }) => Array<PluginOption>)
  /** Vite configuration merged over the host's (a `vite.config` of the app). */
  config?: InlineConfig
  /** Other app files by path relative to the app root. */
  files?: Record<string, string>
  /**
   * `false`: no dev server (a host for `build()` only). Default `true`.
   */
  serve?: boolean
  /**
   * Other built workspace packages linked into the app's `node_modules`, as
   * an installed app has them (e.g. `@tanstack/start-client-core`, which a
   * third-party library of the app imports).
   */
  links?: Array<string>
  /**
   * Options of the React app's `@vitejs/plugin-react` (`react(options)`),
   * e.g. `{ jsxRuntime: 'classic' }`.
   */
  react?: Parameters<typeof react>[0]
}

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

const startPackages: Record<StartFramework, string> = {
  react: '@tanstack/react-start',
  solid: '@tanstack/solid-start',
  vue: '@tanstack/vue-start',
}
const routerPackages: Record<StartFramework, string> = {
  react: '@tanstack/react-router',
  solid: '@tanstack/solid-router',
  vue: '@tanstack/vue-router',
}

type StartPluginFactory = (options?: StartPluginOptions) => Array<PluginOption>

const factories = new Map<StartFramework, Promise<StartPluginFactory>>()

/**
 * `tanstackStart` of the built `@tanstack/<framework>-start/plugin/vite`,
 * resolved through the package's `exports` as an app's `vite.config.ts`
 * resolves it.
 */
export function startPluginFactory(
  framework: StartFramework,
): Promise<StartPluginFactory> {
  let factory = factories.get(framework)
  if (!factory) {
    const pkg = startPackages[framework]
    factory = import(
      pathToFileURL(
        resolveModulePath(`${pkg}/plugin/vite`, {
          from: `${workspacePackage(pkg)}/`,
          conditions: ['import', 'node', 'default'],
        }),
      ).href
    ).then(
      (module: { tanstackStart: StartPluginFactory }) => module.tanstackStart,
    )
    factories.set(framework, factory)
  }
  return factory
}

/** The framework's own Vite plugin, as a user configures it. */
function frameworkPlugins(
  framework: StartFramework,
  options: StartHostOptions = {},
): Array<PluginOption> {
  if (framework === 'react') {
    return [react(options.react)]
  }
  if (framework === 'solid') {
    return [solid({ ssr: true })]
  }
  // Single-file components (`.vue`); the app's JSX is Vue's own runtime
  // (`appTsconfig`)
  return [vue()]
}

/**
 * The app's output directory, absolute (`<root>/dist`, the default
 * layout): Start's preview server imports the server build from the
 * configured output directory, which it resolves against the process's
 * working directory, not the app root (the test process runs elsewhere).
 */
function absoluteOutDir(
  root: string,
  name: () => string = () => 'dist',
): Plugin {
  return {
    name: 'start-host:out-dir',
    // Before Start's plugin (listed first, both `pre`), which derives its
    // environments' output directories from it
    enforce: 'pre',
    config: () => ({ build: { outDir: path.join(root, name()) } }),
  }
}

/**
 * The app's `tsconfig.json` (a test may give its own in `files`). It sets
 * `verbatimModuleSyntax`, a common project setting that Vite's TypeScript
 * transform honours: an import the compiler leaves in a module then stays
 * and loads, so a leak is observable; without it the TypeScript transform,
 * which runs after the compiler, would erase an import nothing reads and
 * hide what the compiler kept (B2 fork A finding). Without a file of its
 * own the app would inherit this package's tsconfig.
 *
 * The host also turns Start's import protection off unless the test
 * configures `importProtection` (a documented option): in dev it replaces a
 * denied `*.server.*` import the compiler left in the client with a mock,
 * so the page never requests the real module and a Start compiler leak
 * (J4.12) would pass unseen. Import protection is a compiler of its own
 * (J6), tested with it on in `importProtection/` and its integration suites.
 */
const appTsconfig = (framework: StartFramework) =>
  `${JSON.stringify(
    {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        // A Vue app's JSX builds Vue's virtual nodes (Vue's own automatic
        // JSX runtime, `vue/jsx-runtime`)
        ...(framework === 'vue' ? { jsxImportSource: 'vue' } : {}),
        strict: true,
        verbatimModuleSyntax: true,
      },
    },
    null,
    2,
  )}\n`

/** How long one page run may take before the page is replaced. */
const pageRunTimeout = 10_000

/** Pages of one host at most: runs of concurrent tests beyond take turns. */
const hostPageLimit = 4

/** Where a case lives: `src/cases/c<n>`. */
export const casesDir = 'src/cases'

/**
 * What the probe route (`request-probe.ts`) gives a callback of a
 * production build host.
 */
interface ProbeContext {
  /** A case module of the server build, by `c<n>/<file>`. */
  load: (file: string) => Promise<Record<string, any>>
}

/** The page route of a production build host. */
const pageRoutePath = '/harness-page'

/**
 * The globals of development-only support a production page must never
 * touch (SPEC G7): React Refresh's registration hooks (what
 * `@vitejs/plugin-react`'s dev transform emits and Start's dev preamble
 * defines) and the router plugin's React Refresh bookkeeping. Not
 * `__TSR_ROUTER__`: the router's own runtime sets and reads it in
 * production.
 */
const devSupportGlobals = [
  '$RefreshReg$',
  '$RefreshSig$',
  '__TSR_REACT_REFRESH__',
  '__vite_plugin_react_preamble_installed__',
]

/**
 * Init script of the production page: every read, write, probe (`in`,
 * `hasOwnProperty`, ...) or definition of a `devSupportGlobals` name, from
 * the page's first statement on, is recorded with its stack
 * (`window.__harnessDevSupportTouches`; `globalTrapSource`).
 */
const devSupportTrap = `Object.defineProperty(window, '__harnessDevSupportTouches', {
  get: ${globalTrapSource({ names: JSON.stringify(devSupportGlobals), stacks: true })},
})`

/** The case modules a production build includes (`import.meta.glob`). */
const caseGlob = `../cases/*/*.{ts,tsx,js,jsx}`
/**
 * The case modules each environment's glob takes: not the ones import
 * protection denies there (`*.server.*` on the client, `*.client.*` on the
 * server), which only the cases' own modules import.
 */
const clientCaseGlob = `['${caseGlob}', '!../cases/*/*.server.*']`
const serverCaseGlob = `['${caseGlob}', '!../cases/*/*.client.*']`

/**
 * The app files of a host: the router, its root route and the probe server
 * route, which runs a callback of the test (by token) inside a real Start
 * request. A host for production builds (`serve: false`, React) also gets
 * a document shell and a page route, which give the page every case module
 * through a lazy `import.meta.glob` (each one a chunk of the build, loaded
 * on demand like any lazy import), and its probe route gives the callback
 * the case modules of the server build the same way.
 */
function appFiles(
  framework: StartFramework,
  serve: boolean,
): Record<string, string> {
  const router = routerPackages[framework]
  const files: Record<string, string> = {
    'src/router.tsx': routerFile(router),
    'src/routes/__root.tsx': rootRouteFile(router),
    [probeRouteFile]: serve
      ? probeRoute(router)
      : probeRoute(router, {
          prelude: `const cases = import.meta.glob(${serverCaseGlob})\n`,
          context: `{ load: (file: string) => cases['../cases/' + file]!() }`,
        }),
  }
  if (!serve && framework === 'vue') {
    // A build-only Vue host (`build()`; `preview()` serves React apps only):
    // the client build takes every case module through a page route
    files['src/routes/harness-page.ts'] =
      `import { createFileRoute } from '${router}'
const cases = import.meta.glob(${clientCaseGlob})
export const Route = createFileRoute('${pageRoutePath}')({
  component: () => {
    Object.assign(window, { __harnessCases: cases, __harnessReady: true })
    return null
  },
})
`
  }
  if (!serve && framework !== 'vue') {
    if (framework !== 'react') {
      throw new Error(
        `production build hosts are React or Vue apps (not ${framework})`,
      )
    }
    files['src/routes/__root.tsx'] =
      `import { HeadContent, Outlet, Scripts, createRootRoute } from '${router}'
export const Route = createRootRoute({
  component: () => <Outlet />,
  shellComponent: ({ children }) => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  ),
})
`
    files['src/routes/harness-page.tsx'] = `import { useEffect } from 'react'
import { createFileRoute } from '${router}'
const cases = import.meta.glob(${clientCaseGlob})
export const Route = createFileRoute('${pageRoutePath}')({
  component: function HarnessPage() {
    useEffect(() => {
      Object.assign(window, { __harnessCases: cases, __harnessReady: true })
    }, [])
    return <main>harness</main>
  },
})
`
  }
  return files
}

/**
 * The dependencies the dev server pre-bundles up front (`optimizeDeps`
 * `include`, with discovery off, as router-plugin's `route-app.ts` does):
 * the framework runtime and the router. With nothing left to discover,
 * Vite's optimizer never reruns and reloads the page while a case runs.
 * Start's own packages are not pre-bundled: the app serves them through
 * Start's plugin, which gives each environment its own entries (a
 * pre-bundle would take their server code into the client).
 */
function prebundledModules(framework: StartFramework): Array<string> {
  const router = routerPackages[framework]
  if (framework === 'react') {
    return [
      'react',
      'react-dom',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'react-dom/client',
      router,
    ]
  }
  if (framework === 'solid') {
    return ['solid-js', 'solid-js/web', 'solid-js/store', router]
  }
  return ['vue', 'vue/jsx-runtime', 'vue/jsx-dev-runtime', router]
}

/**
 * The framework packages an app depends on itself, besides Start and the
 * router: Vue (its JSX runtime and renderers, which the app's own modules
 * import), linked as installed, the copy Start's Vue packages use.
 */
function frameworkLinks(framework: StartFramework): Record<string, string> {
  if (framework !== 'vue') {
    return {}
  }
  return {
    'node_modules/vue': realpathSync(
      path.join(workspacePackage(startPackages.vue), 'node_modules/vue'),
    ),
  }
}

/**
 * Helpers every client script of a case has in scope:
 * - `settle(run)`: `{ value }` (what `run` returns or resolves to), or
 *   `{ thrown: { name, message } }` (what it throws or rejects with), JSON
 *   for the test (`fromPage` turns `thrown` back into a `Thrown`);
 * - `serverFnUrls(namespace)`: the distinct `url`s of the server fns (the
 *   functions with a string `url`, Start's public fetcher property) among
 *   the values of an object, e.g. a module namespace.
 */
export const pagePrelude = `const settle = async (run) => {
  try {
    return { value: await run() }
  } catch (error) {
    return { thrown: { name: error && error.name, message: String(error && error.message !== undefined ? error.message : error) } }
  }
}
const serverFnUrls = (namespace) => [...new Set(Object.values(namespace ?? {}).filter((value) => typeof value === 'function' && typeof value.url === 'string').map((value) => value.url))]`

/** What a page run of a case gives. */
export interface ClientRun<T = unknown> {
  /** The JSON value the script returned. */
  result: T
  /** Uncaught errors of the page and its `console.error` output. */
  errors: Array<string>
  /** The page's console messages during the run, as `type: text`. */
  console: Array<string>
  /**
   * What the page requested during the run, as app paths (`/src/...`,
   * query stripped) or the requested URL for anything else.
   */
  requests: Array<string>
}

export interface StartCase {
  /** The case directory, relative to the app root (`src/cases/c3`). */
  dir: string
  /** URL of a case file on the dev server (default `module.tsx`). */
  url: (file?: string) => string
  /** Absolute path of a case file. */
  file: (file?: string) => string
  /**
   * The code an environment (default `client`) serves for a case file
   * (default `module.tsx`). A failed transform rejects with its error.
   */
  served: (file?: string, environment?: 'client' | 'ssr') => Promise<string>
  /**
   * The case file (default `module.tsx`) evaluated by the SSR environment's
   * module runner: its namespace, in this process. Calling a server fn needs
   * a request: `inRequest`.
   */
  ssr: (file?: string) => Promise<Record<string, any>>
  /**
   * Runs `run` inside a real request of the app (a server route of the app
   * calls it, so Start's request context is the one of that request), and
   * gives what it returns or throws.
   */
  inRequest: <T>(run: () => T | Promise<T>) => Promise<T>
  /**
   * Imports the case file (default `module.tsx`) in the host's Chromium
   * page and runs `script`, the body of an async function with the module's
   * namespace as `module` and `load(file)` (imports another case file) in
   * scope; its JSON value is `result`. A failed import or a throw of the
   * script rejects.
   */
  client: <T = unknown>(
    script: string,
    options?: {
      file?: string
      /** Reload the run's page first: a fresh document, no module instance kept. */
      fresh?: boolean
    },
  ) => Promise<ClientRun<T>>
  /**
   * What importing the case file (default `module.tsx`) in the page loads:
   * case files as `./name` (with and without their extension), packages by
   * name, and other modules by URL; a module whose top-level code throws
   * still counts (`loads` resolves). Static imports are what the browser
   * requested and what Vite's client module graph holds for the module;
   * dynamic imports, which nothing calls here, count by the module graph
   * (they load when the code runs). A module that does not parse, fails to
   * compile or does not link fails.
   */
  loads: (file?: string) => Promise<Array<string>>
  /**
   * The case files that the SSR environment's module graph reaches from a
   * case file (default `module.tsx`) once evaluated (`./name`, with and
   * without their extension, packages by name), static and dynamic. A
   * module the SSR environment fails to compile rejects.
   */
  serverLoads: (file?: string) => Promise<Array<string>>
  /**
   * Everything the app's server reported so far, on every channel (the dev
   * server's merged channel; on a production build, what the build
   * reported). Mark a point with `.length`.
   */
  diagnostics: () => Array<ChannelDiagnostic>
}

export interface StartHost {
  /** The app root. */
  root: string
  framework: StartFramework
  /** The public plugin host (dev server, `build()`). */
  host: PluginHost
  /** Everything the dev server reported, on every channel. */
  diagnostics: Array<ChannelDiagnostic>
  /** Writes a new case (files by path relative to the case directory). */
  case: (files: Record<string, string>) => Promise<StartCase>
  /**
   * Writes app files (relative to the app root) through the watcher and
   * waits for the dev server's bounded settle (dev edits).
   */
  edit: (files: Record<string, string | null>) => Promise<void>
  /**
   * Evaluates page code (an expression, e.g. an async function called at
   * once) on a page of the host, as `StartCase.client` runs a case's: on a
   * page the run holds alone, again on a fresh document if the page
   * reloaded meanwhile. `fresh`: reload the page first.
   */
  run: <T = unknown>(
    source: string,
    options?: { fresh?: boolean },
  ) => Promise<ClientRun<T>>
  /** `vite build` of the app (`PluginHost.build`). */
  build: PluginHost['build']
  /**
   * Production mode of a host created with `serve: false` (React): builds
   * the app as `vite build` does, with every case written so far, and serves
   * the build as `vite preview` does (Start's own preview server: the built
   * server entry handles requests). From then on the cases run against the
   * build: `client` in a page of the production app (the case module is a
   * lazy chunk of the client build, loaded on demand), `ssr` and
   * `inRequest` in the server build, inside its real requests. `served`,
   * `loads` and `serverLoads` are dev-server checks and throw. Write every
   * case first: the build includes the cases that exist when it runs.
   */
  preview: (options?: {
    /**
     * Build and serve again (the same app root), e.g. after rewriting case
     * files: the previous preview server and page are closed first.
     */
    rebuild?: boolean
  }) => Promise<StartPreview>
  /**
   * The host's first page (concurrent runs of `StartCase.client` run on up
   * to `hostPageLimit` pages, one each).
   */
  page: () => Promise<BrowserPage>
  /**
   * Whether a later test file may use the host (`useStartHost`): nothing
   * changed the app its options give (no edit, build or preview).
   */
  reusable: () => boolean
  /**
   * Production mode (`preview()`): every read or write of a development-only
   * global (React Refresh's `$RefreshReg$`/`$RefreshSig$`, the router
   * plugin's `__TSR_REACT_REFRESH__`, the dev preamble's flag) the
   * production page made since it opened, with the stack that made it.
   */
  devSupportTouches: () => Promise<Array<string>>
  close: () => Promise<void>
}

/** A production build of a host app, served (`StartHost.preview`). */
export interface StartPreview {
  /** The build: each environment's chunks and the merged diagnostics. */
  build: HostBuild
  /** URL of the preview server. */
  url: string
}

/** App path of a requested URL of the dev server, without its query. */
function appPath(url: string, origin: string) {
  if (!url.startsWith(origin)) {
    return url
  }
  return decodeURIComponent(url.slice(origin.length).split('?')[0]!)
}

/** Package name of a resolved file inside `node_modules` or the workspace. */
function packageOf(file: string): string | undefined {
  const normalized = file.split('?')[0]!.replace(/\\/g, '/')
  const nodeModules = normalized.lastIndexOf('/node_modules/')
  if (nodeModules !== -1) {
    const rest = normalized.slice(nodeModules + '/node_modules/'.length)
    if (rest.startsWith('.vite/deps/')) {
      return undefined
    }
    const parts = rest.split('/')
    return parts[0]!.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  }
  return undefined
}

/** Package of a bare specifier id (an externalized server dependency). */
function bareSpecifierPackage(id: string): string | undefined {
  if (/^[@a-z0-9][\w.-]*(?:\/[\w.-]+)*$/i.test(id) && !id.startsWith('.')) {
    const parts = id.split('/')
    return id.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
  }
  return undefined
}

/**
 * Starts a Start app on a dev server (see the module comment) and its page.
 */
export async function createStartHost(
  options: StartHostOptions = {},
): Promise<StartHost> {
  const framework = options.framework ?? 'react'
  const startFactory = await startPluginFactory(framework)
  // Import protection off unless the test configures it (see `appTsconfig`)
  const startOptions = {
    importProtection: { enabled: false },
    ...options.start,
  }
  const userPlugins = options.plugins ?? []
  const serve = options.serve ?? true
  /**
   * The output directory of the next build: a rebuild writes elsewhere, as
   * the process keeps the server build it imported from the previous one.
   */
  let outDirName = 'dist'
  let builds = 0
  const host = await createPluginHost({
    dir: harnessDir,
    prefix: `.start-host-${framework}-`,
    client: serve,
    serve,
    plugins: (app) => [
      ...(serve ? [] : [absoluteOutDir(app.root, () => outDirName)]),
      startFactory(startOptions),
      ...frameworkPlugins(framework, options),
      ...(typeof userPlugins === 'function' ? userPlugins(app) : userPlugins),
    ],
    config: {
      ...options.config,
      optimizeDeps: {
        noDiscovery: true,
        ...options.config?.optimizeDeps,
        include: [
          ...prebundledModules(framework),
          ...(options.config?.optimizeDeps?.include ?? []),
        ],
      },
      server: {
        ...options.config?.server,
        watch: {
          ...options.config?.server?.watch,
          // Cases are written once, before anything requests them
          ignored: [`**/${casesDir}/**`],
        },
      },
    },
    symlinks: {
      ...workspacePackageLinks([
        startPackages[framework],
        ...(framework === 'react' ? [] : [routerPackages[framework]]),
        ...(options.links ?? []),
      ]),
      ...frameworkLinks(framework),
    },
    files: {
      'tsconfig.json': appTsconfig(framework),
      ...appFiles(framework, serve),
      ...options.files,
    },
  })
  const root = host.root

  /** A page of the host and what it requested so far. */
  interface HostPage {
    opened: BrowserPage
    requests: Array<string>
  }
  let previewState:
    | { server: PreviewServer; url: string; build: HostBuild }
    | undefined
  /** Base URL of whatever serves the app now: the dev or preview server. */
  const baseUrl = () => {
    if (previewState) {
      return previewState.url
    }
    if (!serve) {
      throw new Error(
        'this host serves nothing yet: call preview() after writing its cases',
      )
    }
    return host.dev.url!
  }
  const origin = () => new URL(baseUrl()).origin
  /**
   * Opens a page of the host: the production page of the preview server
   * (once it hydrated), or the plugin host's page of the dev server. The
   * page gives its scripts `window.__harnessInFlight()`: how many of its
   * requests have not finished yet (Playwright's network events), so page
   * code can wait for the code it requested.
   */
  const openHostPage = async (): Promise<HostPage> => {
    const requests: Array<string> = []
    const inFlight = new Set<unknown>()
    const track = (opened: BrowserPage) => {
      opened.page.on('request', (request) => {
        requests.push(request.url())
        inFlight.add(request)
      })
      opened.page.on('requestfinished', (request) => inFlight.delete(request))
      opened.page.on('requestfailed', (request) => inFlight.delete(request))
      // A new document (a reload) ends the old one: its requests in flight
      // end with it, whether or not the browser reports them as finished
      // or failed
      opened.page.on('framenavigated', (frame) => {
        if (frame === opened.page.mainFrame()) {
          inFlight.clear()
        }
      })
      return opened.page.exposeFunction(
        '__harnessInFlight',
        () => inFlight.size,
      )
    }
    if (previewState) {
      const opened = await openPage('about:blank', {
        initScript: devSupportTrap,
      })
      await track(opened)
      await opened.page.goto(new URL(pageRoutePath, previewState.url).href)
      try {
        await opened.page.waitForFunction(
          () => (window as unknown as Record<string, unknown>).__harnessReady,
          undefined,
          { timeout: 15_000 },
        )
      } catch (error) {
        throw new Error(
          [
            `the production page did not hydrate: ${(error as Error).message}`,
            `html: ${(await opened.page.content()).slice(0, 2000)}`,
            `errors:\n${opened.errors.join('\n') || '(none)'}`,
            `console:\n${opened.console.join('\n') || '(none)'}`,
          ].join('\n'),
        )
      }
      return { opened, requests }
    }
    const opened = await openPage('about:blank')
    await track(opened)
    await opened.page.goto(
      new URL('/__plugin-host__/page.html', baseUrl()).href,
    )
    return { opened, requests }
  }

  // The host's pages: concurrent runs (concurrent tests) each hold one
  // (`runInHostPage`), at most `hostPageLimit`; a page keeps its document
  // from one run to the next (cases have their own URLs). `page()` gives
  // the first one.
  /** Pages open or opening. */
  let pageCount = 0
  /** Every open page. */
  let allPages = new Set<HostPage>()
  let idlePages: Array<HostPage> = []
  let waitingForPage: Array<(page: Promise<HostPage>) => void> = []
  const openCounted = async (): Promise<HostPage> => {
    pageCount++
    try {
      const opened = await openHostPage()
      allPages.add(opened)
      return opened
    } catch (error) {
      pageCount--
      throw error
    }
  }

  /** The first page of the host (opened on first use). */
  const firstPage = async () => {
    const [first] = allPages
    if (first) {
      return first.opened
    }
    const opened = await openCounted()
    idlePages.push(opened)
    return opened.opened
  }

  /** A page no run holds (a new one while fewer than `hostPageLimit`). */
  const takePage = (): Promise<HostPage> => {
    const idle = idlePages.shift()
    if (idle) {
      return Promise.resolve(idle)
    }
    if (pageCount < hostPageLimit) {
      return openCounted()
    }
    return new Promise<Promise<HostPage>>((resolve) =>
      waitingForPage.push(resolve),
    ).then((page) => page)
  }
  const givePage = (page: HostPage) => {
    const next = waitingForPage.shift()
    if (next) {
      next(Promise.resolve(page))
    } else {
      idlePages.push(page)
    }
  }
  /** Closes a page; a run waiting for a page gets a new one. */
  const dropPage = (page: HostPage) => {
    allPages.delete(page)
    pageCount--
    void page.opened.close()
    const next = waitingForPage.shift()
    if (next) {
      next(openCounted())
    }
  }
  /** Closes every page of the host. */
  const closePages = async () => {
    const all = [...allPages]
    allPages = new Set()
    idlePages = []
    waitingForPage = []
    pageCount = 0
    for (const page of all) {
      await page.opened.close()
    }
  }

  /**
   * Runs page code on a page of the host the run holds alone (concurrent
   * runs run on different pages), again on a fresh document if the page
   * reloaded. `fresh`: reload the page first (a new document, no module
   * instance kept).
   */
  const runInHostPage = async <T>(
    source: string,
    runOptions: { fresh?: boolean } = {},
  ): Promise<ClientRun<T>> => {
    const held = await takePage()
    /** Whether the run's page was closed (a script that never settled). */
    const run = { dropped: false }
    try {
      const { opened, requests } = held
      if (runOptions.fresh) {
        await opened.page.reload()
      }
      let lastError: unknown
      for (let attempt = 0; attempt < 3; attempt++) {
        const loads = opened.loads()
        const firstRequest = requests.length
        const firstError = opened.errors.length
        const firstConsole = opened.console.length
        try {
          let timer: ReturnType<typeof setTimeout> | undefined
          const result = (await Promise.race([
            opened.page.evaluate(source),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                // A script that never settles keeps the page busy: the next
                // run gets a new page
                run.dropped = true
                dropPage(held)
                reject(
                  new Error(
                    `the page run did not settle within ${pageRunTimeout} ms (the page is replaced)`,
                  ),
                )
              }, pageRunTimeout)
            }),
          ]).finally(() => clearTimeout(timer))) as T
          return {
            result,
            errors: opened.errors.slice(firstError),
            console: opened.console.slice(firstConsole),
            requests: requests
              .slice(firstRequest)
              .map((url) => appPath(url, origin())),
          }
        } catch (error) {
          lastError = error
          // A navigation destroys the run's context before the new document
          // fires its load event
          const navigated =
            opened.loads() !== loads ||
            /Execution context was destroyed/.test((error as Error).message)
          if (run.dropped || !navigated || previewState) {
            const errors = opened.errors.slice(firstError)
            throw new Error(
              [
                `the page run failed: ${(error as Error).message}`,
                `errors:\n${errors.join('\n') || '(none)'}`,
                `console:\n${opened.console.slice(firstConsole).join('\n') || '(none)'}`,
              ].join('\n'),
              { cause: error },
            )
          }
          // A reload (Vite pre-bundled a dependency the run discovered, or
          // the dev server reloaded its pages): the document is new, so run
          // again
          await opened.page.waitForLoadState()
          await host.dev.idle()
        }
      }
      throw lastError
    } finally {
      if (!run.dropped) {
        givePage(held)
      }
    }
  }

  /**
   * Runs `run` inside a real request of the app (the probe route,
   * `request-probe.ts`), sent over HTTP to the dev or preview server.
   */
  const inAppRequest = <T>(
    run: (context?: ProbeContext) => T | Promise<T>,
  ): Promise<T> => inProbeRequest((url) => fetch(new URL(url, baseUrl())), run)

  const devOnly = (what: string) => {
    if (previewState || !serve) {
      throw new Error(`${what} reads the dev server: not available on a build`)
    }
  }

  let cases = 0
  /** Whether the app changed from what its options give (edits, builds). */
  let changed = false
  const createCase = async (
    files: Record<string, string>,
  ): Promise<StartCase> => {
    const dir = `${casesDir}/c${++cases}`
    for (const [file, code] of Object.entries(files)) {
      const absolute = path.join(root, dir, file)
      await mkdir(path.dirname(absolute), { recursive: true })
      await writeFile(absolute, code)
    }
    const url = (file = 'module.tsx') => `/${dir}/${file}`
    const caseFile = (file = 'module.tsx') => path.join(root, dir, file)
    /** `./name` (and with its extension) of a case file at an app path. */
    const caseNames = (appFile: string): Array<string> => {
      const prefix = `/${dir}/`
      if (!appFile.startsWith(prefix)) {
        return []
      }
      const relative = appFile.slice(prefix.length)
      const bare = relative.replace(/\.[cm]?[jt]sx?$/, '')
      return [...new Set([`./${bare}`, `./${relative}`])]
    }
    /** Case files and packages a module graph reaches from `file`. */
    const graphLoads = (environment: 'client' | 'ssr', file: string) => {
      const devEnvironment = host.dev.vite.environments[environment]
      const graph = devEnvironment.moduleGraph
      /** Packages by the file Vite's dependency optimizer bundled them to. */
      const optimized = new Map<string, string>()
      const metadata = devEnvironment.depsOptimizer?.metadata
      for (const deps of [metadata?.optimized, metadata?.discovered]) {
        for (const [name, info] of Object.entries(deps ?? {})) {
          optimized.set(path.resolve(info.file), name)
        }
      }
      const start = graph.getModulesByFile(caseFile(file))
      const seen = new Set<unknown>()
      const names = new Set<string>()
      const queue = [...(start ?? [])]
      while (queue.length > 0) {
        const module = queue.shift()!
        if (seen.has(module)) {
          continue
        }
        seen.add(module)
        for (const imported of module.importedModules) {
          const id = imported.id ?? imported.url
          const appFile = imported.file?.startsWith(root)
            ? `/${path.relative(root, imported.file).split(path.sep).join('/')}`
            : undefined
          if (appFile) {
            for (const name of caseNames(appFile)) {
              names.add(name)
            }
          }
          const optimizedName = imported.file
            ? optimized.get(path.resolve(imported.file))
            : undefined
          const pkg = optimizedName ?? packageOf(id) ?? bareSpecifierPackage(id)
          if (pkg) {
            names.add(pkg)
          } else if (id.startsWith('\0') || !appFile) {
            names.add(id)
          }
          queue.push(imported)
        }
      }
      return names
    }
    /** The case file as a key of the build's case modules. */
    const buildKey = (file = 'module.tsx') =>
      `${dir.slice(casesDir.length + 1)}/${file}`
    const startCase: StartCase = {
      dir,
      url,
      file: caseFile,
      served: async (file, environment = 'client') => {
        devOnly('served()')
        return host.transform(url(file), environment)
      },
      ssr: async (file) => {
        if (previewState) {
          return inAppRequest((context) => context!.load(buildKey(file)))
        }
        return host.importServer(url(file), 'ssr')
      },
      inRequest: (run) => inAppRequest(() => run()),
      client: (script, clientOptions = {}) =>
        runInHostPage(
          `(async () => {
${pagePrelude}
const load = ${
            previewState
              ? `(file) => window.__harnessCases[${JSON.stringify(`../cases/${dir.slice(casesDir.length + 1)}/`)} + file]()`
              : `(file) => import(${JSON.stringify(`/${dir}/`)} + file)`
          }
const module = await load(${JSON.stringify(clientOptions.file ?? 'module.tsx')})
${script}
})()`,
          { fresh: clientOptions.fresh },
        ),
      loads: async (file = 'module.tsx') => {
        devOnly('loads()')
        const run = await runInHostPage<{ error?: string; fatal?: boolean }>(
          `(async () => {
try {
  await import(${JSON.stringify(url(file))})
  return {}
} catch (error) {
  // A module that did not compile, parse or link never ran: no outcome.
  // A throw of a module's own code is one of its loads.
  const fatal = error instanceof SyntaxError || /Failed to fetch dynamically imported module|error loading dynamically imported module/.test(String(error && error.message))
  return { error: String(error && (error.stack || error.message)), fatal }
}
})()`,
        )
        if (run.result.fatal) {
          throw new Error(
            `${url(file)} did not load in the page: ${run.result.error}\n${run.errors.join('\n')}`,
          )
        }
        const names = new Set<string>()
        for (const request of run.requests) {
          for (const name of caseNames(request)) {
            names.add(name)
          }
        }
        for (const name of graphLoads('client', file)) {
          names.add(name)
        }
        names.delete(`./${file.replace(/\.[cm]?[jt]sx?$/, '')}`)
        names.delete(`./${file}`)
        return [...names]
      },
      diagnostics: () =>
        previewState ? previewState.build.diagnostics : host.diagnostics,
      serverLoads: async (file = 'module.tsx') => {
        devOnly('serverLoads()')
        // A module the SSR environment cannot compile has no outcome (its
        // graph would be empty): that fails, as in `loads()`. A throw of the
        // module's own code still counts.
        await host.transform(url(file), 'ssr')
        await host.importServer(url(file), 'ssr').catch(() => {})
        const names = graphLoads('ssr', file)
        names.delete(`./${file.replace(/\.[cm]?[jt]sx?$/, '')}`)
        names.delete(`./${file}`)
        return [...names]
      },
    }
    return startCase
  }

  return {
    root,
    framework,
    host,
    get diagnostics() {
      return host.diagnostics
    },
    case: createCase,
    reusable: () => !changed,
    run: (source, runOptions) => runInHostPage(source, runOptions),
    edit: async (files) => {
      changed = true
      if (cases > 0) {
        // The dev server's settle owes an event to every app file the
        // watcher has not reported, and it never reports the (ignored)
        // case directories
        throw new Error(
          'edit() on a host that has cases: use a host of its own for dev edits (files on disk before it starts, edits outside src/cases)',
        )
      }
      await host.edit(files)
    },
    build: (buildOptions) => {
      changed = true
      return host.build(buildOptions)
    },
    preview: async (previewOptions = {}) => {
      changed = true
      if (serve) {
        throw new Error('preview() needs a host created with `serve: false`')
      }
      if (framework !== 'react') {
        throw new Error(
          `preview() serves React apps (not ${framework}): use build()`,
        )
      }
      if (previewState && previewOptions.rebuild) {
        const previous = previewState
        previewState = undefined
        await closePages()
        await previous.server.close()
        outDirName = `dist-${++builds}`
      }
      if (previewState) {
        return { build: previewState.build, url: previewState.url }
      }
      const build = await host.build()
      const server = await vitePreview(
        mergeConfig(
          {
            root,
            configFile: false,
            envDir: false,
            publicDir: false,
            logLevel: 'silent',
            plugins: [
              absoluteOutDir(root, () => outDirName),
              startFactory(startOptions),
              ...frameworkPlugins(framework, options),
              ...(typeof userPlugins === 'function'
                ? userPlugins({ root, command: 'build' })
                : userPlugins),
            ],
            preview: { port: 0, host: '127.0.0.1' },
          } satisfies InlineConfig,
          options.config ?? {},
        ),
      )
      const url = server.resolvedUrls?.local[0]
      if (!url) {
        await server.close()
        throw new Error('the preview server has no local URL')
      }
      previewState = { server, url, build }
      return { build, url }
    },
    page: firstPage,
    devSupportTouches: async () => {
      if (!previewState) {
        throw new Error(
          'devSupportTouches() reads the production page: call preview() first',
        )
      }
      await firstPage()
      const touches: Array<string> = []
      for (const { opened } of allPages) {
        touches.push(
          ...(await opened.page.evaluate(
            () =>
              (
                window as unknown as {
                  __harnessDevSupportTouches: Array<string>
                }
              ).__harnessDevSupportTouches,
          )),
        )
      }
      return touches
    },
    close: async () => {
      try {
        await closePages()
      } finally {
        try {
          await previewState?.server.close()
        } finally {
          await host.close()
        }
      }
    },
  }
}

/**
 * Free hosts of this test process, by their options (`hostKey`), for later
 * test files: a project that keeps its modules across test files
 * (`isolate: false`) starts a host once per worker and options, not once per
 * file. Each case of a host has its own directory and URLs, so module
 * instances never carry over from one file's cases to another's; a host
 * whose app changed (an edit, a build) is closed instead. What a host
 * reported before a file is that file's to mark (`diagnostics.length`).
 */
const freeHosts = new Map<string, Array<StartHost>>()

/** Free hosts a test process keeps, at most. */
const freeHostLimit = 4

/**
 * The options of a host as a key, when they are plain data (no plugins, no
 * functions): only those hosts are shared between files.
 */
export function hostKey(value: unknown): string | undefined {
  const found = { function: false }
  const key = JSON.stringify(value, (_, item: unknown) => {
    if (typeof item === 'function') {
      found.function = true
    }
    return item
  })
  return found.function ? undefined : key
}

/** A free host of these options, or a new one (`start`). */
export async function takeHost<T extends { close: () => Promise<void> }>(
  key: string | undefined,
  start: () => Promise<T>,
): Promise<T> {
  const free = key === undefined ? undefined : freeHosts.get(key)?.pop()
  return (free as T | undefined) ?? start()
}

/** Gives a host back for later files (or closes it, see `freeHosts`). */
export async function giveBackHost(
  key: string | undefined,
  host: { close: () => Promise<void>; reusable?: () => boolean },
) {
  if (key === undefined || host.reusable?.() === false) {
    await host.close()
    return
  }
  const list = freeHosts.get(key) ?? []
  list.push(host as StartHost)
  freeHosts.set(key, list)
  freeOrder.push({ key, host })
  while (freeOrder.length > freeHostLimit) {
    const oldest = freeOrder.shift()!
    const left = freeHosts.get(oldest.key)
    const index = left?.indexOf(oldest.host as StartHost) ?? -1
    if (index !== -1) {
      left!.splice(index, 1)
      await oldest.host.close()
    }
  }
}
const freeOrder: Array<{
  key: string
  host: { close: () => Promise<void> }
}> = []

/**
 * One Start host per test file and options (`createStartHost`), taken before
 * the file's tests (a free one an earlier file of the process gave back, or
 * a new one) and given back after them. Returns the host getter.
 */
export function useStartHost(
  options: StartHostOptions = {},
): () => Promise<StartHost> {
  const key = hostKey(options)
  let started: Promise<StartHost> | undefined
  beforeAll(() => {
    started = takeHost(key, () => createStartHost(options))
    return started.then(() => {})
  }, 60_000)
  afterAll(async () => {
    const host = await started?.catch(() => undefined)
    if (host) {
      await giveBackHost(key, host)
    }
  })
  return () => {
    if (!started) {
      throw new Error('useStartHost: no host before beforeAll ran')
    }
    return started
  }
}

/**
 * The hosts of a test file by framework, taken on first use and given back
 * after the file's tests (a file whose cases run under several frameworks).
 */
export function useStartHosts(
  options: Omit<StartHostOptions, 'framework'> = {},
): (framework?: StartFramework) => Promise<StartHost> {
  const started = new Map<StartFramework, Promise<StartHost>>()
  const keyOf = (framework: StartFramework) =>
    hostKey({ ...options, framework })
  afterAll(async () => {
    for (const [framework, host] of started) {
      const resolved = await host.catch(() => undefined)
      if (resolved) {
        await giveBackHost(keyOf(framework), resolved)
      }
    }
  })
  return (framework = 'react') => {
    let host = started.get(framework)
    if (!host) {
      host = takeHost(keyOf(framework), () =>
        createStartHost({ ...options, framework }),
      )
      started.set(framework, host)
    }
    return host
  }
}

/** A build of a host app (`StartHost.build`). */
export type StartHostBuild = HostBuild

/** Asserts a client run reported no page error. */
export function expectNoPageErrors(run: Pick<ClientRun, 'errors'>) {
  expect(run.errors, 'page errors').toEqual([])
}
