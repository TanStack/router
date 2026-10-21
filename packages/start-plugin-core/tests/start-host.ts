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
 * Use `useStartHost(options)` in a test file: one host per file (created in
 * `beforeAll`, closed in `afterAll`), and `host().case(files)` per test.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import react from '@vitejs/plugin-react'
import solid from 'vite-plugin-solid'
import { resolveModulePath } from 'exsolve'
import { mergeConfig, preview as vitePreview } from 'vite'
import { afterAll, beforeAll, expect } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import {
  workspacePackage,
  workspacePackageLinks,
} from '@tanstack/compiler-test-utils/workspace-packages'
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
function frameworkPlugins(framework: StartFramework): Array<PluginOption> {
  if (framework === 'react') {
    return [react()]
  }
  if (framework === 'solid') {
    return [solid({ ssr: true })]
  }
  return []
}

/**
 * The app's output directory, absolute (`<root>/dist`, the default
 * layout): Start's preview server imports the server build from the
 * configured output directory, which it resolves against the process's
 * working directory, not the app root (the test process runs elsewhere).
 */
function absoluteOutDir(root: string): Plugin {
  return {
    name: 'start-host:out-dir',
    // Before Start's plugin (listed first, both `pre`), which derives its
    // environments' output directories from it
    enforce: 'pre',
    config: () => ({ build: { outDir: path.join(root, 'dist') } }),
  }
}

/** Where a case lives: `src/cases/c<n>`. */
export const casesDir = 'src/cases'

/** The global the app's probe route reads the server callbacks from. */
const probesKey = 'tanstack.start-host.probes'
const probes = ((globalThis as Record<symbol, unknown>)[
  Symbol.for(probesKey)
] ??= new Map()) as Map<string, (context?: ProbeContext) => Promise<void>>

/** What the probe route gives a callback of a production build host. */
interface ProbeContext {
  /** A case module of the server build, by `c<n>/<file>`. */
  load: (file: string) => Promise<Record<string, any>>
}

/** The probe route of the app (a server route, so it runs in a request). */
const probeRoutePath = '/harness-probe'
/** The page route of a production build host. */
const pageRoutePath = '/harness-page'

/** The case modules a production build includes (`import.meta.glob`). */
const caseGlob = `../cases/*/*.{ts,tsx,js,jsx}`

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
  const probeRoute = `import { createFileRoute } from '${router}'
${serve ? '' : `const cases = import.meta.glob('${caseGlob}')\n`}export const Route = createFileRoute('${probeRoutePath}')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const run = new URL(request.url).searchParams.get('run')
        const probe = globalThis[Symbol.for(${JSON.stringify(probesKey)})].get(run)
        if (!probe) {
          return new Response('no probe ' + run, { status: 404 })
        }
        await probe(${serve ? '' : `{ load: (file) => cases['../cases/' + file]() }`})
        return new Response('ok')
      },
    },
  },
})
`
  const files: Record<string, string> = {
    'src/router.tsx': `import { createRouter } from '${router}'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
    'src/routes/__root.tsx': `import { createRootRoute } from '${router}'
export const Route = createRootRoute()
`,
    'src/routes/harness-probe.ts': probeRoute,
  }
  if (!serve) {
    if (framework !== 'react') {
      throw new Error(
        `production build hosts are React apps (not ${framework})`,
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
const cases = import.meta.glob('${caseGlob}')
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

/** The modules the page imports first, so Vite pre-bundles them at once. */
function warmModules(framework: StartFramework): Array<string> {
  const start = startPackages[framework]
  const common = [
    start,
    `${start}/client-rpc`,
    `${start}/hydration`,
    routerPackages[framework],
  ]
  if (framework === 'react') {
    return [
      ...common,
      'react',
      'react/jsx-dev-runtime',
      'react/jsx-runtime',
      'react-dom/client',
    ]
  }
  if (framework === 'solid') {
    return [...common, 'solid-js', 'solid-js/web']
  }
  return common
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
    options?: { file?: string },
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
   * without their extension, packages by name), static and dynamic.
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
  preview: () => Promise<StartPreview>
  /** The host's page (one per host). */
  page: () => Promise<BrowserPage>
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

/**
 * Starts a Start app on a dev server (see the module comment) and its page.
 */
export async function createStartHost(
  options: StartHostOptions = {},
): Promise<StartHost> {
  const framework = options.framework ?? 'react'
  const tanstackStart = await startPluginFactory(framework)
  const userPlugins = options.plugins ?? []
  const serve = options.serve ?? true
  const host = await createPluginHost({
    dir: harnessDir,
    prefix: `.start-host-${framework}-`,
    client: serve,
    serve,
    plugins: (app) => [
      ...(serve ? [] : [absoluteOutDir(app.root)]),
      tanstackStart(options.start),
      ...frameworkPlugins(framework),
      ...(typeof userPlugins === 'function' ? userPlugins(app) : userPlugins),
    ],
    config: {
      ...options.config,
      server: {
        ...options.config?.server,
        watch: {
          ...options.config?.server?.watch,
          // Cases are written once, before anything requests them
          ignored: [`**/${casesDir}/**`],
        },
      },
    },
    symlinks: workspacePackageLinks([
      startPackages[framework],
      ...(framework === 'react' ? [] : [routerPackages[framework]]),
    ]),
    files: { ...appFiles(framework, serve), ...options.files },
  })
  const root = host.root

  let page: Promise<BrowserPage> | undefined
  const requests: Array<string> = []
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
  const openHostPage = () => {
    page ??= (async () => {
      if (previewState) {
        const opened = await openPage(
          new URL(pageRoutePath, previewState.url).href,
        )
        opened.page.on('request', (request) => {
          requests.push(request.url())
        })
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
        return opened
      }
      const opened = await openPage(
        new URL('/__plugin-host__/page.html', baseUrl()).href,
      )
      opened.page.on('request', (request) => {
        requests.push(request.url())
      })
      // Vite pre-bundles what the page's first imports discover and reloads
      // the page when that changes the bundles: import the runtime first,
      // until a round loads nothing new.
      const warm = `await Promise.allSettled(${JSON.stringify(
        warmModules(framework).map((specifier) => `/@id/${specifier}`),
      )}.map((url) => import(url)))`
      for (let round = 0; round < 10; round++) {
        const loads = opened.loads()
        try {
          await opened.page.evaluate(`(async () => { ${warm} })()`)
          await host.dev.idle()
          await new Promise((resolve) => setTimeout(resolve, 200))
          if (opened.loads() === loads) {
            break
          }
        } catch {
          // The page reloaded meanwhile
        }
        await opened.page.waitForLoadState()
      }
      return opened
    })()
    return page
  }

  /** Runs page code, again on a fresh document if the page reloaded. */
  const runInHostPage = async <T>(source: string): Promise<ClientRun<T>> => {
    const opened = await openHostPage()
    let lastError: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      const loads = opened.loads()
      const firstRequest = requests.length
      const firstError = opened.errors.length
      const firstConsole = opened.console.length
      try {
        const result = (await opened.page.evaluate(source)) as T
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
        if (opened.loads() === loads || previewState) {
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
        // A reload (Vite pre-bundled a dependency the run discovered): the
        // document is new, so run again
        await opened.page.waitForLoadState()
        await host.dev.idle()
      }
    }
    throw lastError
  }

  /** Runs `run` inside a real request of the app (the probe route). */
  const inAppRequest = async <T>(
    run: (context?: ProbeContext) => T | Promise<T>,
  ): Promise<T> => {
    const token = Math.random().toString(36).slice(2)
    let outcome: { value: T } | { error: unknown } | undefined
    probes.set(token, async (context) => {
      try {
        outcome = { value: await run(context) }
      } catch (error) {
        outcome = { error }
      }
    })
    try {
      const response = await fetch(
        new URL(
          `${probeRoutePath}?run=${encodeURIComponent(token)}`,
          baseUrl(),
        ),
      )
      const body = await response.text()
      if (!outcome) {
        throw new Error(
          `the probe request did not run (${response.status}): ${body}`,
        )
      }
    } finally {
      probes.delete(token)
    }
    if ('error' in outcome) {
      throw outcome.error
    }
    return outcome.value
  }

  const devOnly = (what: string) => {
    if (previewState || !serve) {
      throw new Error(`${what} reads the dev server: not available on a build`)
    }
  }

  let cases = 0
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
      const graph = host.dev.vite.environments[environment]!.moduleGraph
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
          const pkg = packageOf(id)
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
        runInHostPage(`(async () => {
${pagePrelude}
const load = ${
          previewState
            ? `(file) => window.__harnessCases[${JSON.stringify(`../cases/${dir.slice(casesDir.length + 1)}/`)} + file]()`
            : `(file) => import(${JSON.stringify(`/${dir}/`)} + file)`
        }
const module = await load(${JSON.stringify(clientOptions.file ?? 'module.tsx')})
${script}
})()`),
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
    edit: async (files) => {
      await host.edit(files)
    },
    build: (buildOptions) => host.build(buildOptions),
    preview: async () => {
      if (serve) {
        throw new Error('preview() needs a host created with `serve: false`')
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
              absoluteOutDir(root),
              tanstackStart(options.start),
              ...frameworkPlugins(framework),
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
    page: openHostPage,
    close: async () => {
      try {
        await (page ? (await page).close() : undefined)
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

const hosts = new Map<string, Promise<StartHost>>()

/**
 * One Start host per test file and options (`createStartHost`), created
 * before the file's tests and closed after them. Returns the host getter.
 */
export function useStartHost(
  options: StartHostOptions = {},
): () => Promise<StartHost> {
  let started: Promise<StartHost> | undefined
  beforeAll(() => {
    started = createStartHost(options)
    return started.then(() => {})
  }, 60_000)
  afterAll(async () => {
    await (await started)?.close()
  })
  return () => {
    if (!started) {
      throw new Error('useStartHost: no host before beforeAll ran')
    }
    return started
  }
}

/**
 * The hosts of a test file by framework, created on first use and closed
 * after the file's tests (a file whose cases run under several frameworks).
 */
export function useStartHosts(
  options: Omit<StartHostOptions, 'framework'> = {},
): (framework?: StartFramework) => Promise<StartHost> {
  const started = new Map<StartFramework, Promise<StartHost>>()
  afterAll(async () => {
    for (const host of started.values()) {
      await (await host).close()
    }
  })
  return (framework = 'react') => {
    let host = started.get(framework)
    if (!host) {
      host = createStartHost({ ...options, framework })
      started.set(framework, host)
    }
    return host
  }
}

void hosts

/** A build of a host app (`StartHost.build`). */
export type StartHostBuild = HostBuild

/** Asserts a client run reported no page error. */
export function expectNoPageErrors(run: Pick<ClientRun, 'errors'>) {
  expect(run.errors, 'page errors').toEqual([])
}
