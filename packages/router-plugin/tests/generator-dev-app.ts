/**
 * The route generator on a running dev server, as an app sees it: a real
 * dev server (Vite with the router plugin and `@vitejs/plugin-react`, or
 * Rsbuild with the router plugin's Rspack entry and `@rsbuild/plugin-react`)
 * serves a React app with file-based routes in `routes/` and the real
 * `@tanstack/react-router`, a real browser page (headless Chromium) runs it,
 * and the test creates, edits, renames and deletes files on disk, which the
 * dev server's own watchers report (and the generator's, on Rspack).
 *
 * The test reads what an app shows: the live router's routes (the app's
 * own router, which its entry publishes as `window.__APP_ROUTER__`), what a
 * page renders at a path, and which scripts the page loaded before and
 * after a navigation (code splitting: a route's component loads when the
 * app navigates to it). `settle()` waits for the dev server by its events
 * (the harnesses' own `settle()`), then for the page's outcome: neither the
 * dev server nor the page has work in flight (`waitForOutcome`), never on
 * how many hot updates or invalidations an edit takes (N21).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import react from '@vitejs/plugin-react'
import { parseSync } from 'vite'
import { expect, onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { openDiagnosticChannel } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { tanstackRouter } from '../src/vite'
import { holdsMarker } from './route-app'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { Diagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { Config } from '../src/vite'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export type Bundler = 'vite' | 'rsbuild'

/** A root route that renders `MARK_ROOT` around its child routes. */
export const rootRoute = `import { Outlet, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: () => (
    <main>
      MARK_ROOT
      <Outlet />
    </main>
  ),
})
`

/** A route file whose component renders `text`. */
export const route = (routePath: string, text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${routePath}')({
  component: Page,
})
function Page() {
  return <p>${text}</p>
}
`

const main = `import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
// The app's own reference to its router, for the test to read
;(window as any).__APP_ROUTER__ = router
createRoot(document.getElementById('app')!).render(<RouterProvider router={router} />)
`

/**
 * Dependencies the app imports, pre-bundled up front as Vite does for an app
 * that installed them (the router package is a linked workspace package
 * here, which Vite would otherwise serve as source and discover the
 * dependencies of late, reloading the page).
 */
const prebundled = [
  'react',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/client',
  '@tanstack/react-router',
]

/** A route of the live router. */
export interface LiveRoute {
  id: string
  fullPath: string
  /** Id of the parent route (none for the root route). */
  parent: string | undefined
}

export interface GeneratorDevApp {
  bundler: Bundler
  root: string
  /** Content of an app file (relative to the app root). */
  read: (relative: string) => Promise<string>
  /**
   * Writes app files (relative to the app root; `null` deletes a file)
   * without waiting for the dev server.
   */
  write: (files: Record<string, string | null>) => Promise<void>
  /** Moves an app file without waiting for the dev server. */
  rename: (from: string, to: string) => Promise<void>
  /**
   * Waits until the dev server is done with every write so far, and (Vite)
   * the page with what the server sent it meanwhile: neither the dev server
   * (transforms) nor the page (module and hot-update fetches, the document
   * of a reload) has work in flight, twice in a row (`waitForOutcome`). A
   * report of an edit therefore comes before the next write. `timeout`
   * bounds the wait in all.
   */
  settle: (options?: { timeout?: number }) => Promise<void>
  /** `write(files)`, then `settle()`. */
  edit: (files: Record<string, string | null>) => Promise<void>
  /** The browser page running the app (a new one at each `visit()`). */
  page: BrowserPage
  /**
   * Loads `pathname` in a new page (which starts the record of loaded
   * scripts anew) and waits until the app shows `expected`.
   */
  visit: (pathname: string, expected: string | RegExp) => Promise<void>
  /**
   * Navigates the running app to `pathname` (the live router, no page load)
   * and waits until it shows `expected`.
   */
  navigate: (pathname: string, expected: string | RegExp) => Promise<void>
  /** The routes of the live router in the page, sorted by id. */
  routes: () => Promise<Array<LiveRoute>>
  /** Each script the page loaded since the last `visit()`. */
  scripts: () => Promise<Array<{ url: string; code: string }>>
  /** Errors of the dev server (Vite's logged errors, Rsbuild's compile errors). */
  errors: () => Array<string>
  /** Closes the dev server (and the page), like stopping `vite`/`rsbuild dev`. */
  close: () => Promise<void>
  /**
   * Stops the dev server (and closes the page), like stopping `vite`/
   * `rsbuild dev`, but keeps the app on disk, to edit it afterwards and
   * observe that nothing reacts; the app is removed when the test ends.
   */
  stop: () => Promise<void>
  /**
   * What the test process printed while the app ran: every `console` method
   * and direct stdout/stderr writes (e.g. the generator reporting a route
   * file it cannot handle), joined.
   */
  logs: () => string
  /** A point in the app's diagnostics, to read those after it. */
  mark: () => DiagnosticsMark
  /**
   * What the app reported through every real channel (since `since`, by
   * default since it started), as diagnostics (`@tanstack/compiler-test-
   * utils/diagnostics`): what its plugins printed (every `console` method,
   * `log`/`info`/`debug` and stdout writes as `info`, stderr writes as
   * `warning`; e.g. the generator), and the dev server's own errors
   * and warnings (Vite's logger, Rsbuild's compile errors and warnings). A
   * report may come through any of them (SPEC G5, §5.7; V1R gen G13).
   */
  diagnostics: (since?: DiagnosticsMark) => Array<Diagnostic>
}

/** How many diagnostics each channel had at a point (`mark()`). */
export interface DiagnosticsMark {
  console: number
  server: number
}

export interface GeneratorDevAppOptions {
  bundler: Bundler
  /**
   * App files relative to its root: route files in `routes/`
   * (`routes/__root.tsx` defaults to `rootRoute`) and other modules.
   */
  files: Record<string, string>
  /**
   * Router plugin options over the defaults (`autoCodeSplitting: true`), or
   * a function of the app root returning them (the Rspack plugin resolves
   * relative paths from the working directory).
   */
  pluginOptions?: Partial<Config> | ((root: string) => Partial<Config>)
  /** Workspace packages linked into the app's `node_modules`. */
  links?: Array<string>
}

/**
 * Starts a dev server on an app of `files`, waits until it settled, and
 * opens the app in a browser page at `/`.
 */
export async function generatorDevApp(
  options: GeneratorDevAppOptions,
): Promise<GeneratorDevApp> {
  const { bundler } = options
  /**
   * Every channel a plugin of the test process can print through: the
   * console's methods and direct writes to stdout and stderr (a write to
   * stderr carries no severity: it counts as a warning, a report, not as an
   * error), merged (`openDiagnosticChannel`).
   */
  const channel = openDiagnosticChannel({ console: true, streams: true })
  onTestFinished(() => channel.close())
  const printed = () => channel.diagnostics
  const logs = () =>
    printed()
      .map((diagnostic) => diagnostic.text)
      .join('\n')

  const files = {
    'main.tsx': main,
    'routes/__root.tsx': rootRoute,
    ...options.files,
  }
  const symlinks = workspacePackageLinks(options.links ?? [])
  const app =
    bundler === 'vite'
      ? await viteApp(files, symlinks, options.pluginOptions)
      : await rsbuildApp(files, symlinks, options.pluginOptions, () =>
          printed().map((diagnostic) => diagnostic.text),
        )
  await app.settle()

  let page: BrowserPage
  let scripts: Array<Promise<{ url: string; code: string }>> = []
  /** The page's requests in flight (module fetches, a reload's document). */
  let inFlight = new Set<unknown>()
  const waitForApp = (expected: string | RegExp) =>
    page.waitForText(expected, { selector: '#app' })
  /**
   * Opens `pathname` in a new page (and closes the last one): a page the
   * dev server's client is reloading meanwhile (e.g. after a route tree
   * update) cannot take another navigation reliably.
   */
  const open = async (pathname: string) => {
    const last = page as BrowserPage | undefined
    page = await openPage('about:blank', { registerCleanup: onTestFinished })
    await last?.close()
    scripts = []
    const requests = new Set<unknown>()
    inFlight = requests
    page.page.on('request', (request) => {
      // A navigation of the page (a reload) ends the old document: its
      // requests in flight end with it, whether or not the browser reports
      // them as finished or failed
      if (
        request.isNavigationRequest() &&
        request.frame() === page.page.mainFrame()
      ) {
        requests.clear()
      }
      requests.add(request)
    })
    // Answered: the server's work for it is done (its body, which the
    // browser may stop reading when it drops the module, is not awaited)
    page.page.on('response', (response) => requests.delete(response.request()))
    page.page.on('requestfinished', (request) => requests.delete(request))
    page.page.on('requestfailed', (request) => requests.delete(request))
    page.page.on('response', (response) => {
      // A script the server answered with an error ran no code; and
      // Playwright fetches the body of such a response again (the browser
      // kept none): a request of the harness's own, which the dev server
      // would transform and report on, late
      if (
        response.request().resourceType() === 'script' &&
        response.status() < 400
      ) {
        scripts.push(
          response.text().then(
            (code) => ({ url: response.url(), code }),
            () => ({ url: response.url(), code: '' }),
          ),
        )
      }
    })
    await page.page.goto(new URL(pathname, app.url).href)
  }
  await open('/')

  /**
   * Vite: until the page handled what the server sent it: neither the dev
   * server nor the page has work in flight (a hot update's fetches, whose
   * transforms may report errors; a reload), twice in a row, within one
   * bound.
   */
  /**
   * The page's requests in flight, but for a module whose file an edit
   * deleted or renamed away: the page's hot import of it (a module it had
   * loaded) can stay unanswered, as nothing serves the file any more; what
   * the page shows decides the edit's outcome, not that request.
   */
  const pending = () =>
    [...inFlight]
      .map((request) => (request as { url: () => string }).url())
      .filter((url) => {
        const { pathname, origin } = new URL(url)
        if (
          origin !== new URL(app.url).origin ||
          !/\.[cm]?[jt]sx?$/.test(pathname)
        ) {
          return true
        }
        return existsSync(path.join(app.root, decodeURIComponent(pathname)))
      })
  const pageSettled = async (timeout = 15_000) => {
    const { hmr } = app
    if (!hmr) {
      return
    }
    await waitForOutcome({
      timeout,
      applied: () => Promise.resolve(true),
      quiet: async () => {
        await hmr.idle()
        return pending().length === 0
      },
      describe: () =>
        Promise.resolve(
          `the page still has ${pending().length} request(s) in flight: ${pending().join(', ')}`,
        ),
    })
  }
  const settle = async (settleOptions?: { timeout?: number }) => {
    await app.settle(settleOptions)
    await pageSettled(settleOptions?.timeout)
  }
  const write = async (written: Record<string, string | null>) => {
    await app.write(written)
  }

  return {
    bundler,
    root: app.root,
    read: (relative) => readFile(path.join(app.root, relative), 'utf8'),
    write,
    rename: async (from, to) => {
      await app.rename(from, to)
    },
    settle,
    edit: async (edited) => {
      await write(edited)
      await settle()
    },
    get page() {
      return page
    },
    visit: async (pathname, expected) => {
      await open(pathname)
      await waitForApp(expected)
    },
    navigate: async (pathname, expected) => {
      await page.page.evaluate(
        (to) => (window as any).__APP_ROUTER__.navigate({ to }),
        pathname,
      )
      await waitForApp(expected)
    },
    routes: async () => {
      const live: Array<LiveRoute> = await page.page.evaluate(() =>
        Object.values((window as any).__APP_ROUTER__.routesById).map(
          (liveRoute: any) => ({
            id: liveRoute.id,
            fullPath: liveRoute.fullPath,
            parent: liveRoute.parentRoute?.id,
          }),
        ),
      )
      return live.sort((a, b) => a.id.localeCompare(b.id))
    },
    scripts: () => Promise.all(scripts),
    errors: app.errors,
    close: async () => {
      await page.close()
      await app.close()
    },
    stop: async () => {
      await page.close()
      await app.stop()
    },
    logs,
    mark: () => ({
      console: printed().length,
      server: app.diagnostics().length,
    }),
    diagnostics: (since = { console: 0, server: 0 }) => [
      ...printed().slice(since.console),
      ...app.diagnostics().slice(since.server),
    ],
  }
}

/** The part of a dev server the app needs. */
interface AppServer {
  root: string
  url: string
  write: (files: Record<string, string | null>) => Promise<void>
  rename: (from: string, to: string) => Promise<void>
  settle: (options?: { timeout?: number }) => Promise<void>
  errors: () => Array<string>
  close: () => Promise<void>
  stop: () => Promise<void>
  /**
   * The server's own errors and warnings so far, in order: its logger's and
   * its compilations' (what the process prints is the app's channel).
   */
  diagnostics: () => Array<Diagnostic>
  /** Vite: a wait until no transform is in flight. */
  hmr?: {
    idle: () => Promise<void>
  }
}

async function viteApp(
  files: Record<string, string>,
  symlinks: Record<string, string>,
  pluginOptions: GeneratorDevAppOptions['pluginOptions'] = {},
): Promise<AppServer> {
  const server = await createDevServer({
    dir: harnessDir,
    prefix: '.generator-dev-vite-',
    registerCleanup: onTestFinished,
    browser: true,
    symlinks,
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
    config: { optimizeDeps: { include: prebundled } },
    plugins: ({ root }) => [
      tanstackRouter({
        target: 'react',
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        autoCodeSplitting: true,
        ...(typeof pluginOptions === 'function'
          ? pluginOptions(root)
          : pluginOptions),
      }),
      react(),
    ],
  })
  return {
    root: server.root,
    url: server.url!,
    write: server.write,
    rename: server.rename,
    settle: async () => {
      await server.settle()
    },
    errors: () =>
      server.logs
        .filter((log) => log.startsWith('error:'))
        .map((log) => log.slice('error: '.length)),
    close: server.close,
    stop: server.stop,
    // The dev server's merged channel: its logger and what the plugins it
    // runs print (console, streams), which reaches the server's capture
    diagnostics: () =>
      server.diagnostics.filter((diagnostic) => diagnostic.severity !== 'info'),
    hmr: {
      idle: () => server.idle(),
    },
  }
}

async function rsbuildApp(
  files: Record<string, string>,
  symlinks: Record<string, string>,
  pluginOptions: GeneratorDevAppOptions['pluginOptions'] = {},
  printedTexts: () => Array<string>,
): Promise<AppServer> {
  const server = await createRsbuildDevServer({
    dir: harnessDir,
    prefix: '.generator-dev-rsbuild-',
    registerCleanup: onTestFinished,
    browser: true,
    entry: 'main.tsx',
    symlinks,
    files,
    config: { html: { mountId: 'app' } },
    plugins: ({ root }) => [
      pluginReact(),
      {
        name: 'generator-dev-app',
        setup(api) {
          api.modifyRspackConfig((config) => {
            config.plugins.push(
              tanstackRouterRspack({
                target: 'react',
                // The Rspack plugin resolves relative paths from the working
                // directory
                routesDirectory: path.join(root, 'routes'),
                generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                autoCodeSplitting: true,
                ...(typeof pluginOptions === 'function'
                  ? pluginOptions(root)
                  : pluginOptions),
              }),
            )
          })
        },
      } satisfies RsbuildPlugin,
    ],
  })
  // What the test process printed and what the dev server's own capture
  // received (the generator prints in the server's scope), since a mark
  const mark = () => ({
    printed: printedTexts().length,
    server: server.diagnostics.length,
  })
  let logsBefore = mark()
  const loggedSince = (since: ReturnType<typeof mark>) => [
    ...printedTexts().slice(since.printed),
    ...server.diagnostics
      .slice(since.server)
      .map((diagnostic) => diagnostic.text),
  ]
  return {
    root: server.root,
    url: server.url!,
    write: async (written) => {
      logsBefore = mark()
      await server.write(written)
    },
    rename: async (from, to) => {
      logsBefore = mark()
      await server.rename(from, to)
    },
    settle: (settleOptions = {}) =>
      server.settle({
        ...settleOptions,
        // The generator reports a route file it cannot handle, which no
        // compile then reads
        accept: (relative) =>
          loggedSince(logsBefore).some((log) => log.includes(relative)),
      }),
    errors: () => [...server.errors],
    close: server.close,
    stop: server.stop,
    // The dev server's merged channel: its compilations, Rsbuild's logger and what the plugins it
    // runs print (console, streams), which reaches the server's capture
    diagnostics: () =>
      server.diagnostics.filter((diagnostic) => diagnostic.severity !== 'info'),
  }
}

/**
 * The path a route file's `createFileRoute(path)` call names (parsed), and
 * the file's code with that string literal left out. The call is found by
 * its binding, not its spelling: a local the file imports as
 * `createFileRoute` (an alias included) or a member of a namespace import
 * (`router.createFileRoute`); in a file that imports no such binding, a
 * call of `createFileRoute` by that name.
 */
export function createFileRouteCall(code: string): {
  path: string | undefined
  rest: string
} {
  const { program } = parseSync('route.tsx', code, { sourceType: 'module' })
  const locals = new Set<string>()
  const namespaces = new Set<string>()
  for (const statement of program.body as Array<any>) {
    if (statement.type !== 'ImportDeclaration') {
      continue
    }
    for (const specifier of statement.specifiers ?? []) {
      if (
        specifier.type === 'ImportSpecifier' &&
        (specifier.imported?.name ?? specifier.imported?.value) ===
          'createFileRoute'
      ) {
        locals.add(specifier.local.name)
      } else if (specifier.type === 'ImportNamespaceSpecifier') {
        namespaces.add(specifier.local.name)
      }
    }
  }
  if (locals.size === 0 && namespaces.size === 0) {
    locals.add('createFileRoute')
  }
  const isFactory = (callee: any) =>
    (callee?.type === 'Identifier' && locals.has(callee.name)) ||
    (callee?.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object?.type === 'Identifier' &&
      namespaces.has(callee.object.name) &&
      callee.property?.name === 'createFileRoute')
  let found: { value: string; start: number; end: number } | undefined
  const visit = (node: unknown) => {
    if (found || !node || typeof node !== 'object') {
      return
    }
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const candidate = node as Record<string, any>
    if (
      candidate.type === 'CallExpression' &&
      isFactory(candidate.callee) &&
      candidate.arguments?.[0]?.type === 'Literal' &&
      typeof candidate.arguments[0].value === 'string'
    ) {
      const literal = candidate.arguments[0]
      found = { value: literal.value, start: literal.start, end: literal.end }
      return
    }
    for (const value of Object.values(candidate)) {
      visit(value)
    }
  }
  visit(program)
  return found
    ? {
        path: found.value,
        rest: code.slice(0, found.start) + code.slice(found.end),
      }
    : { path: undefined, rest: code }
}

/**
 * Asserts that the route file at `relative` names `routePath` in its
 * `createFileRoute()` call and is otherwise `expected` (the route file as
 * written, whatever path it named).
 */
export async function expectRouteFile(
  app: GeneratorDevApp,
  relative: string,
  routePath: string,
  expected: string,
) {
  const actual = createFileRouteCall(await app.read(relative))
  expect(actual.path, `the path ${relative} names`).toBe(routePath)
  expect(actual.rest).toBe(createFileRouteCall(expected).rest)
}

/**
 * Whether a script the page loaded holds the user's string `text`: a
 * decoded string value of its code (`holdsMarker`), whatever its quoting,
 * escaping or JSX compilation. Dependencies and the tools' own modules (in
 * `node_modules`, Vite's client) hold no user code.
 */
export function scriptHolds(
  script: { url: string; code: string },
  text: string,
) {
  const { pathname } = new URL(script.url)
  if (/\/node_modules\/|^\/@(?:vite|react-refresh)\b/.test(pathname)) {
    return false
  }
  return holdsMarker(script.code, text)
}

/**
 * Asserts that the app loads the code rendering `text` (a route component's)
 * only when it navigates to `pathname`: no script the page loaded at `from`
 * holds it (`scriptHolds`), and the app shows it after navigating.
 */
export async function expectLoadedOnNavigation(
  app: GeneratorDevApp,
  from: { pathname: string; shows: string },
  pathname: string,
  text: string,
) {
  await app.visit(from.pathname, from.shows)
  expect(
    (await app.scripts())
      .filter((script) => scriptHolds(script, text))
      .map((script) => script.url),
    `scripts loaded at ${from.pathname} containing ${text}`,
  ).toEqual([])
  await app.navigate(pathname, text)
  expect(
    (await app.scripts()).some((script) => scriptHolds(script, text)),
    `a script loaded on navigating to ${pathname} contains ${text}`,
  ).toBe(true)
}
