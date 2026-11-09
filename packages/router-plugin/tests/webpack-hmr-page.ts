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
 * own); a React app writes no JSX (`createElement`), so no JSX transform or
 * React Refresh takes part: route HMR alone decides whether an edit applies
 * in place. A Solid app compiles its JSX with `babel-preset-solid`, as
 * `docs/router/installation/with-webpack.md` sets it up (no solid-refresh).
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

const mains = {
  react: `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
createRoot(document.getElementById('app')!).render(
  createElement(RouterProvider, { router }),
)
`,
  solid: `import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'
const router = createRouter({ routeTree })
render(() => <RouterProvider router={router} />, document.getElementById('app')!)
`,
}

const indexHtml = `<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script src="/main.js"></script>
  </body>
</html>
`

export interface WebpackHmrPageOptions {
  /** Default `react`. */
  target?: 'react' | 'solid'
  /** webpack's `devtool` (default: webpack's own, `eval` in development). */
  devtool?: string
  /**
   * Router plugin options over the defaults (`target: 'react'`,
   * `autoCodeSplitting: true`, the app's `routes/` directory and route tree).
   */
  pluginOptions?: Partial<Config>
  /**
   * App files relative to its root: route files in `routes/` (React:
   * TypeScript without JSX, Solid: TSX; `routes/__root.tsx` defaults to an
   * empty root route).
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
  /** Writes app files and waits until webpack compiled them; returns the compile's errors. */
  write: (files: Record<string, string>) => Promise<Array<string>>
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
  const target = options.target ?? 'react'
  const entry = target === 'react' ? 'main.ts' : 'main.tsx'
  const app = await createApp({
    dir: harnessDir,
    prefix: '.webpack-hmr-page-',
    registerCleanup: onTestFinished,
    files: {
      'public/index.html': indexHtml,
      [entry]: mains[target],
      'routes/__root.tsx': `import { createRootRoute } from '@tanstack/${target}-router'
export const Route = createRootRoute({})
`,
      ...options.files,
    },
  })
  const root = app.root
  // Files older than the watcher's start: webpack's watcher reports a file
  // modified right before it started as changed
  const past = new Date(Date.now() - 60_000)
  for (const file of [entry, ...Object.keys(options.files)]) {
    await utimes(path.join(root, file), past, past)
  }

  const compiler = webpack({
    mode: 'development',
    ...(options.devtool ? { devtool: options.devtool } : {}),
    context: root,
    entry: { main: `./${entry}` },
    output: { path: path.join(root, 'dist'), publicPath: '/' },
    resolve: { extensions: ['.ts', '.tsx', '.js'] },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          include: root,
          loader: require.resolve('babel-loader'),
          options: {
            babelrc: false,
            configFile: false,
            presets:
              target === 'react'
                ? [require.resolve('@babel/preset-typescript')]
                : [
                    [
                      require.resolve('@babel/preset-typescript'),
                      { isTSX: true, allExtensions: true },
                    ],
                    [
                      require.resolve('babel-preset-solid'),
                      { generate: 'dom' },
                    ],
                  ],
          },
        },
      ],
    },
    plugins: [
      tanstackRouter({
        target,
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
  /** Writes `files`, then waits until webpack compiled them: a compile started after the write and nothing compiles or is pending. */
  const write = async (files: Record<string, string>, deadline: number) => {
    const compiles = started
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(root, file), code)
    }
    await waitForOutcome({
      timeout: deadline - Date.now(),
      applied: () => started > compiles,
      quiet: webpackQuiet,
      describe: () =>
        `webpack did not compile the edit of ${Object.keys(files).join(', ')}`,
    })
  }

  return {
    page,
    write: async (files) => {
      await write(files, Date.now() + editTimeout)
      return compileErrors
    },
    edit: async (files, expected) => {
      const start = {
        loads: page.loads(),
        errors: page.errors.length,
      }
      const deadline = Date.now() + editTimeout
      await write(files, deadline)
      // Until the page shows the edit, with nothing in flight
      await waitForOutcome({
        timeout: Math.max(0, deadline - Date.now()),
        failWhenQuietFor: editQuietFailure,
        problems: () => compileErrors,
        applied: async () => (await text()).includes(expected),
        quiet: () => webpackQuiet() && requests() === 0,
        // (the page's text holds the expected text)
        observed: async () => ({ actual: await text(), expected }),
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
