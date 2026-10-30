/**
 * Route HMR of the router plugin's webpack entry as an app sees it: a real
 * webpack dev server (`webpack-dev-server` with `hot: true`, the setup of the
 * webpack quickstart example and `docs/router/installation/with-webpack.md`)
 * serves a small file-based React app with the real router package, a real
 * browser page (headless Chromium, `openPage`) runs it with webpack's own HMR
 * client, and the test edits a route file on disk, which webpack's own
 * watcher reports. The test reads the page: what it shows, whether it
 * reloaded, and what it reported as an error.
 *
 * Nothing of the HMR path is modelled: webpack decides which modules accept
 * the update, and its client (`webpack/hot/dev-server`) reloads the page when
 * none does. The app's TypeScript compiles with `babel-loader` and
 * `@babel/preset-typescript` (webpack has no TypeScript transform of its
 * own); the app writes no JSX (`createElement`), so no JSX transform or React
 * Refresh takes part: route HMR alone decides whether an edit applies in
 * place.
 *
 * An edit settles on its outcome (`waitForOutcome`): first webpack compiled
 * the written file (a compile that started after the write ended and nothing
 * compiles), then the page shows the expected text with no request in
 * flight, within one bound; never on how many compiles, hot updates or
 * client messages it takes.
 */
import { utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import webpack from 'webpack'
import WebpackDevServer from 'webpack-dev-server'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { trackRequests } from '@tanstack/compiler-test-utils/hmr-sync'
import { waitForOutcome } from '@tanstack/compiler-test-utils/outcome'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'
import { tanstackRouter } from '../src/webpack'
import type { AddressInfo } from 'node:net'
import type { BrowserPage } from '@tanstack/compiler-test-utils/browser'
import type { Config } from '../src/webpack'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const main = `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(
  createElement(RouterProvider, { router }),
)
`

const rootRoute = `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`

const indexHtml = `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script src="/main.js"></script>
  </body>
</html>
`

export interface WebpackHmrPageOptions {
  /**
   * Router plugin options over the defaults (`target: 'react'`,
   * `autoCodeSplitting: true`, the app's `routes/` directory and route tree).
   */
  pluginOptions?: Partial<Config>
  /**
   * App files relative to its root: route files in `routes/` (TypeScript
   * without JSX; `routes/__root.ts` defaults to an empty root route).
   */
  files: Record<string, string>
  /** Text the app shows once it rendered. */
  ready: string
}

export interface WebpackEditResult {
  /** Whether the page loaded again since the edit began. */
  reloaded: boolean
  /** Uncaught errors and `console.error` messages of the page since the edit. */
  errors: Array<string>
}

export interface WebpackHmrPage {
  page: BrowserPage
  /**
   * Writes app files, waits until webpack compiled them, then until the page
   * shows `expected` with no request in flight (one overall bound, 20 s).
   */
  edit: (
    files: Record<string, string>,
    expected: string,
  ) => Promise<WebpackEditResult>
}

const editTimeout = 20_000

/**
 * How long webpack and the page stay quiet without the page showing the
 * edit before the edit counts as not shown (`failWhenQuietFor`).
 */
const editQuietFailure = 3_000

/**
 * Starts a webpack dev server on an app of `files`, opens it in a browser
 * page and waits until it shows `ready`. The server, the page and the app's
 * directory are disposed of when the test finishes.
 */
export async function openWebpackHmrPage(
  options: WebpackHmrPageOptions,
): Promise<WebpackHmrPage> {
  const app = await createApp({
    dir: harnessDir,
    prefix: '.webpack-hmr-page-',
    registerCleanup: onTestFinished,
    files: {
      'public/index.html': indexHtml,
      'main.ts': main,
      'routes/__root.ts': rootRoute,
      ...options.files,
    },
  })
  const root = app.root
  // Files older than the watcher's start: webpack's watcher reports a file
  // modified right before it started as changed
  const past = new Date(Date.now() - 60_000)
  for (const file of ['main.ts', ...Object.keys(options.files)]) {
    await utimes(path.join(root, file), past, past)
  }

  const compiler = webpack({
    mode: 'development',
    context: root,
    entry: { main: './main.ts' },
    output: { path: path.join(root, 'dist'), publicPath: '/' },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          include: root,
          loader: require.resolve('babel-loader'),
          options: {
            babelrc: false,
            configFile: false,
            presets: [require.resolve('@babel/preset-typescript')],
          },
        },
      ],
    },
    plugins: [
      tanstackRouter({
        target: 'react',
        routesDirectory: path.join(root, 'routes'),
        generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
        autoCodeSplitting: true,
        ...options.pluginOptions,
      }),
    ],
    infrastructureLogging: { level: 'none' },
    stats: 'none',
  })

  /** Compiles started and ended, whether one is running, and its errors. */
  let started = 0
  let compiling = false
  let invalidated = false
  let compileErrors: Array<string> = []
  compiler.hooks.invalid.tap('webpack-hmr-page', () => {
    invalidated = true
  })
  compiler.hooks.watchRun.tap('webpack-hmr-page', () => {
    started++
    compiling = true
    invalidated = false
  })
  compiler.hooks.done.tap('webpack-hmr-page', (stats) => {
    compiling = false
    compileErrors = stats.hasErrors()
      ? stats
          .toJson({ all: false, errors: true })
          .errors!.map((error) => error.message)
      : []
  })
  compiler.hooks.failed.tap('webpack-hmr-page', (error) => {
    compiling = false
    compileErrors = [error.stack ?? error.message]
  })

  const server = new WebpackDevServer(
    {
      host: '127.0.0.1',
      port: 0,
      hot: true,
      static: { directory: path.join(root, 'public'), watch: false },
      historyApiFallback: true,
      setupExitSignals: false,
      client: { overlay: false, logging: 'warn' },
    },
    compiler,
  )
  await server.start()
  onTestFinished(() => server.stop())
  const port = (server.server!.address() as AddressInfo).port

  const page = await openPage(`http://127.0.0.1:${port}/`, {
    registerCleanup: onTestFinished,
  })
  await page.waitForText(options.ready, { selector: '#app' })

  /** The page's requests in flight (hot-update fetches, a reload). */
  const requests = trackRequests(page)
  const text = async () => {
    try {
      return await page.text('#app')
    } catch {
      // The page is reloading
      return ''
    }
  }
  const webpackQuiet = () => !compiling && !invalidated

  return {
    page,
    edit: async (files, expected) => {
      const start = {
        loads: page.loads(),
        errors: page.errors.length,
        compiles: started,
      }
      const deadline = Date.now() + editTimeout
      for (const [file, code] of Object.entries(files)) {
        await writeFile(path.join(root, file), code)
      }
      // Until webpack compiled the edit: a compile started after the write
      // and nothing compiles or is pending
      await waitForOutcome({
        timeout: deadline - Date.now(),
        applied: () => started > start.compiles,
        quiet: webpackQuiet,
        describe: () =>
          `webpack did not compile the edit of ${Object.keys(files).join(', ')}`,
      })
      // Until the page shows the edit, with nothing in flight
      await waitForOutcome({
        timeout: Math.max(0, deadline - Date.now()),
        failWhenQuietFor: editQuietFailure,
        problems: () => compileErrors,
        applied: async () => (await text()).includes(expected),
        quiet: () => webpackQuiet() && requests() === 0,
        describe: async () =>
          [
            `the page shows: ${JSON.stringify(await text())}`,
            `expected: ${expected}`,
            `page loads: ${page.loads()}`,
            `console:\n${page.console.join('\n') || '(none)'}`,
          ].join('\n'),
      })
      return {
        reloaded: page.loads() > start.loads,
        errors: page.errors.slice(start.errors),
      }
    },
  }
}
