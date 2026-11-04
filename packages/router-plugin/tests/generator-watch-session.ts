/**
 * The generator entries of webpack and Rspack in the compiler's own watch
 * mode (`compiler.watch`, as webpack-dev-server and `--watch` use it), on a
 * temporary app with file-based routes: what generator-watch-mode.test.ts
 * (a compiler test) and a file-watcher control run. Waits
 * are on the compiler's own build events.
 */
import { mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import { onTestFinished } from '@tanstack/compiler-test-utils/test-scope'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export type WatchBundler = 'webpack' | 'rspack'

/** One completed build of the watch session. */
export interface Build {
  error: string | undefined
  errors: Array<string>
}

/**
 * Waits until `check` holds, checking again at each change of what it reads
 * and at least every 25 ms; `timeout` only guards against what never comes.
 */
export async function until(
  check: () => boolean | Promise<boolean>,
  what: () => string,
  next: () => Promise<void>,
  timeout = 20_000,
) {
  const deadline = Date.now() + timeout
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error(`${what()} within ${timeout} ms`)
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      next(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, 25)
      }),
    ])
    clearTimeout(timer)
  }
}

export interface WatchSession {
  /** Absolute path of an app file. */
  file: (relative: string) => string
  /** The completed builds so far. */
  builds: Array<Build>
  /** Resolves at the next completed build. */
  waitForBuild: () => Promise<void>
  /**
   * The routes of a router over the route tree of the last build, and the
   * page it renders at `pathname` once loaded (when it has that route).
   */
  run: (pathname: string) => Promise<{ routes: Array<string>; html: string }>
  /** Closes the watch session (idempotent). */
  close: () => Promise<unknown>
}

/**
 * Starts a watch session of the bundler's generator entry on an app with a
 * root route and its route tree, and waits for its first build. The session
 * closes and the app is removed when the test ends.
 */
export async function startWatchSession(
  bundler: WatchBundler,
): Promise<WatchSession> {
  const root = await createAppDirectory(harnessDir, '.generator-watch-')
  let close: () => Promise<unknown> = () => Promise.resolve()
  onTestFinished(async () => {
    await close()
    await rm(root, { recursive: true, force: true })
  })
  const file = (relative: string) => path.join(root, relative)
  await mkdir(file('routes'), { recursive: true })
  // An app package of its own: the generated route tree imports route
  // files without extensions, which an ES module package (this test
  // package's) resolves only with the generator's `addExtensions`
  await writeFile(file('package.json'), '{}\n')
  await writeFile(
    file('routes/__root.js'),
    `import { Outlet, createRootRoute } from '@tanstack/react-router'
import { createElement } from 'react'
export const Route = createRootRoute({ component: () => createElement('main', null, 'MARK_ROOT', createElement(Outlet)) })
`,
  )
  await writeFile(
    file('main.js'),
    `export { routeTree } from './routeTree.gen.js'\n`,
  )
  const pluginOptions = {
    target: 'react' as const,
    routesDirectory: file('routes'),
    generatedRouteTree: file('routeTree.gen.js'),
    disableTypes: true,
    disableLogging: true,
    // A component the bundler compiles without a JSX loader
    customScaffolding: {
      routeTemplate:
        "%%tsrImports%%\n\n%%tsrExportStart%%{\n  component: () => 'MARK_SCAFFOLD',\n}%%tsrExportEnd%%\n",
    },
  }
  const config = {
    context: root,
    mode: 'development',
    devtool: false,
    target: 'node',
    entry: './main.js',
    output: {
      path: file('dist'),
      filename: 'main.cjs',
      library: { type: 'commonjs2' },
    },
    externals: {
      '@tanstack/react-router': 'commonjs @tanstack/react-router',
      react: 'commonjs react',
    },
    infrastructureLogging: { level: 'none' },
    stats: 'none',
  }
  const createCompiler = async (): Promise<any> => {
    if (bundler === 'webpack') {
      const { default: webpack } = await import('webpack')
      const { TanStackRouterGeneratorWebpack } = await import('../src/webpack')
      return webpack({
        ...config,
        plugins: [TanStackRouterGeneratorWebpack(pluginOptions)],
      } as any)
    }
    const { rspack } = await import('@rsbuild/core')
    const { TanStackRouterGeneratorRspack } = await import('../src/rspack')
    return rspack({
      ...config,
      plugins: [TanStackRouterGeneratorRspack(pluginOptions)],
    } as any)
  }

  // The app as a developer starts watching it: with its route tree, from a
  // build (`compiler.run`), and no file changed in the last minute. The
  // session's first build then changes no file, and nothing is new to the
  // bundler's watcher (webpack rebuilds for files changed up to 2 s before
  // it started watching), so no rebuild is pending when the test creates a
  // route file. (A route file created while a rebuild runs the generator
  // for the unchanged route tree is dropped: router-generator
  // generator-dev.test.ts "events that arrive together", a pinned bug.)
  const build = await createCompiler()
  await new Promise<void>((resolve, reject) => {
    build.run((error: Error | null, stats: any) => {
      build.close(() => {
        if (error || stats?.hasErrors()) {
          reject(error ?? new Error(String(stats.toString('errors-only'))))
        } else {
          resolve()
        }
      })
    })
  })

  const minuteAgo = new Date(Date.now() - 60_000)
  for (const name of [
    'package.json',
    'routes',
    'routes/__root.js',
    'main.js',
    'routeTree.gen.js',
  ]) {
    await utimes(file(name), minuteAgo, minuteAgo)
  }

  const compiler = await createCompiler()
  const builds: Array<Build> = []
  let built = () => {}
  let nextBuild = new Promise<void>((resolve) => {
    built = resolve
  })
  const watching = compiler.watch(
    { aggregateTimeout: 50 },
    (error: Error | null, stats: any) => {
      builds.push({
        error: error ? String(error) : undefined,
        errors: stats?.hasErrors()
          ? stats
              .toJson({ all: false, errors: true })
              .errors.map((entry: { message: string }) => entry.message)
          : [],
      })
      built()
      nextBuild = new Promise<void>((resolve) => {
        built = resolve
      })
    },
  )
  let closed = false
  close = () =>
    closed
      ? Promise.resolve()
      : new Promise((resolve) => {
          closed = true
          watching.close(resolve)
        })
  const waitForBuild = () => nextBuild

  const require = createRequire(file('main.js'))
  const run = async (pathname: string) => {
    const bundle = file('dist/main.cjs')
    delete require.cache[bundle]
    const { routeTree } = require(bundle)
    const {
      RouterProvider,
      createMemoryHistory,
      createRouter,
    } = require('@tanstack/react-router')
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [pathname] }),
    })
    const routes = Object.values(router.routesById)
      .map((route: any) => `${route.id} < ${route.parentRoute?.id ?? ''}`)
      .sort()
    if (!(pathname in router.routesById)) {
      return { routes, html: '' }
    }
    await router.load()
    return {
      routes,
      html: renderToString(createElement(RouterProvider, { router })),
    }
  }

  await until(
    () => builds.length > 0,
    () => 'no first build',
    waitForBuild,
  )
  return { file, builds, waitForBuild, run, close: () => close() }
}
