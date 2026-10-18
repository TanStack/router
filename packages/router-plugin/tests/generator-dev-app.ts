/**
 * The route generator on a running dev server, as an app sees it: a real
 * dev server (Vite with the router plugin and `@vitejs/plugin-react`, or
 * Rsbuild with the router plugin's Rspack entry and `@rsbuild/plugin-react`)
 * serves a React app with file-based routes in `routes/` and the real
 * `@tanstack/react-router`, a real browser page (headless Chromium) runs it,
 * and the test creates, edits, renames and deletes files on disk, which the
 * dev server's own watchers report (and the generator's, on Rspack).
 *
 * The test reads what an app shows: the live router's routes, what a page
 * renders at a path, and which scripts the page loaded before and after a
 * navigation (code splitting: a route's component loads when the app
 * navigates to it). `settle()` waits for the dev server by events only (the
 * harnesses' own `settle()`).
 */
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import react from '@vitejs/plugin-react'
import { parseSync } from 'vite'
import { expect, onTestFinished } from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import { tanstackRouter as tanstackRouterRspack } from '../src/rspack'
import { tanstackRouter } from '../src/vite'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { RsbuildPlugin } from '@rsbuild/core'
import type { Config } from '../src/core/config'

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
   * Waits until the dev server is done with every write so far; `timeout`
   * only guards against events that never come.
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
  /**
   * What the app's plugins logged with `console.error` and `console.warn`
   * (e.g. the generator reporting a route file it cannot handle), joined.
   */
  logs: () => string
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
  const logged: Array<string> = []
  const { error, warn } = console
  console.error = (...args: Array<unknown>) => {
    logged.push(args.map(String).join(' '))
  }
  console.warn = (...args: Array<unknown>) => {
    logged.push(args.map(String).join(' '))
  }
  onTestFinished(() => {
    console.error = error
    console.warn = warn
  })
  const logs = () => logged.join('\n')

  const files = {
    'main.tsx': main,
    'routes/__root.tsx': rootRoute,
    ...options.files,
  }
  const symlinks = workspacePackageLinks(options.links ?? [])
  const app =
    bundler === 'vite'
      ? await viteApp(files, symlinks, options.pluginOptions)
      : await rsbuildApp(files, symlinks, options.pluginOptions, logged)
  await app.settle()

  let page: BrowserPage
  let scripts: Array<Promise<{ url: string; code: string }>> = []
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
    page.page.on('response', (response) => {
      if (response.request().resourceType() === 'script') {
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

  return {
    bundler,
    root: app.root,
    read: (relative) => readFile(path.join(app.root, relative), 'utf8'),
    write: app.write,
    rename: app.rename,
    settle: app.settle,
    edit: async (edited) => {
      await app.write(edited)
      await app.settle()
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
        (to) => (window as any).__TSR_ROUTER__.navigate({ to }),
        pathname,
      )
      await waitForApp(expected)
    },
    routes: async () => {
      const live: Array<LiveRoute> = await page.page.evaluate(() =>
        Object.values((window as any).__TSR_ROUTER__.routesById).map(
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
    logs,
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
  }
}

async function rsbuildApp(
  files: Record<string, string>,
  symlinks: Record<string, string>,
  pluginOptions: GeneratorDevAppOptions['pluginOptions'] = {},
  logged: Array<string>,
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
  let logsBefore = 0
  return {
    root: server.root,
    url: server.url!,
    write: async (written) => {
      logsBefore = logged.length
      await server.write(written)
    },
    rename: async (from, to) => {
      logsBefore = logged.length
      await server.rename(from, to)
    },
    settle: (settleOptions = {}) =>
      server.settle({
        ...settleOptions,
        // The generator reports a route file it cannot handle, which no
        // compile then reads
        accept: (relative) =>
          logged.slice(logsBefore).some((log) => log.includes(relative)),
      }),
    errors: () => [...server.errors],
  }
}

/**
 * The path a route file's `createFileRoute(path)` call names (parsed), and
 * the file's code with that string literal left out.
 */
export function createFileRouteCall(code: string): {
  path: string | undefined
  rest: string
} {
  const { program } = parseSync('route.tsx', code, { sourceType: 'module' })
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
      candidate.callee?.type === 'Identifier' &&
      candidate.callee.name === 'createFileRoute' &&
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
 * Asserts that the app loads the code rendering `text` (a route component's)
 * only when it navigates to `pathname`: no script the page loaded at `from`
 * contains it, and the app shows it after navigating.
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
      .filter((script) => script.code.includes(text))
      .map((script) => script.url),
    `scripts loaded at ${from.pathname} containing ${text}`,
  ).toEqual([])
  await app.navigate(pathname, text)
  expect(
    (await app.scripts()).some((script) => script.code.includes(text)),
    `a script loaded on navigating to ${pathname} contains ${text}`,
  ).toBe(true)
}
