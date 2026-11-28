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
import { closeAtEnd } from '@tanstack/compiler-test-utils/test-end'

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

export type WatchBundler = 'webpack' | 'rspack'

/** One completed build of the watch session. */
export interface Build {
  error: string | undefined
  errors: Array<string>
  /** The exports of the bundle it wrote, loaded right after it (a build without errors). */
  exports?: Record<string, any>
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
  /** The routes of a router over the route tree of `build` (one with `exports`), as `run` lists them. */
  routesOf: (build: Build) => Array<string>
  /**
   * Closes the watching, runs `whileClosed`, and opens another watching on
   * the same compiler (as a tool pausing and resuming a compiler does);
   * waits for its first build.
   */
  reopen: (whileClosed?: () => Promise<void>) => Promise<void>
  /** Closes the watch session (idempotent). */
  close: () => Promise<unknown>
}

export interface WatchSessionOptions {
  /**
   * App files over the session's (relative to its root; `main.js` is the
   * entry). A module imported with the query `?source` is its text
   * (`asset/source`).
   */
  files?: Record<string, string>
  /** Generator options over the session's, given the app's `file`. */
  pluginOptions?: (
    file: (relative: string) => string,
  ) => Record<string, unknown>
  /**
   * The bundler's plugin: its generator entry (default), or its router
   * plugin (`TanStackRouterWebpack`, `TanStackRouterRspack`: the generator
   * and the route code splitter).
   */
  plugin?: 'generator' | 'router'
}

/**
 * Starts a watch session of the bundler's generator entry on an app with a
 * root route and its route tree, and waits for its first build. The session
 * closes and the app is removed when the test ends.
 */
export async function startWatchSession(
  bundler: WatchBundler,
  options: WatchSessionOptions = {},
): Promise<WatchSession> {
  let close: () => Promise<unknown> = () => Promise.resolve()
  const root = await closeAtEnd(
    () => createAppDirectory(harnessDir, '.generator-watch-'),
    async (created) => {
      await close()
      await rm(created, { recursive: true, force: true })
    },
  )
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
  for (const [relative, code] of Object.entries(options.files ?? {})) {
    await mkdir(path.dirname(file(relative)), { recursive: true })
    await writeFile(file(relative), code)
  }
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
    ...options.pluginOptions?.(file),
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
    module: { rules: [{ resourceQuery: /^\?source$/, type: 'asset/source' }] },
    infrastructureLogging: { level: 'none' },
    stats: 'none',
  }
  const createCompiler = async (): Promise<any> => {
    if (bundler === 'webpack') {
      const { default: webpack } = await import('webpack')
      const { TanStackRouterGeneratorWebpack, TanStackRouterWebpack } =
        await import('../src/webpack')
      const plugin =
        options.plugin === 'router'
          ? TanStackRouterWebpack
          : TanStackRouterGeneratorWebpack
      return webpack({
        ...config,
        plugins: [plugin(pluginOptions)],
      } as any)
    }
    const { rspack } = await import('@rsbuild/core')
    const { TanStackRouterGeneratorRspack, TanStackRouterRspack } =
      await import('../src/rspack')
    const plugin =
      options.plugin === 'router'
        ? TanStackRouterRspack
        : TanStackRouterGeneratorRspack
    return rspack({
      ...config,
      plugins: [plugin(pluginOptions)],
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
    ...Object.keys(options.files ?? {}),
  ]) {
    await utimes(file(name), minuteAgo, minuteAgo)
  }

  const require = createRequire(file('main.js'))
  const bundle = file('dist/main.cjs')
  /** The exports of the bundle as built last. */
  const load = () => {
    delete require.cache[bundle]
    return require(bundle) as Record<string, any>
  }

  const compiler = await createCompiler()
  const builds: Array<Build> = []
  let built = () => {}
  let nextBuild = new Promise<void>((resolve) => {
    built = resolve
  })
  const onBuild = (error: Error | null, stats: any) => {
    const errors: Array<string> = stats?.hasErrors()
      ? stats
          .toJson({ all: false, errors: true })
          .errors.map((entry: { message: string }) => entry.message)
      : []
    let exports: Record<string, any> | undefined
    if (!error && errors.length === 0) {
      try {
        exports = load()
      } catch (cause) {
        errors.push(`the bundle threw: ${String(cause)}`)
      }
    }
    builds.push({ error: error ? String(error) : undefined, errors, exports })
    built()
    nextBuild = new Promise<void>((resolve) => {
      built = resolve
    })
  }
  let watching = compiler.watch({ aggregateTimeout: 50 }, onBuild)
  let closed = false
  close = () =>
    closed
      ? Promise.resolve()
      : new Promise((resolve) => {
          closed = true
          watching.close(resolve)
        })
  const waitForBuild = () => nextBuild
  const reopen = async (whileClosed?: () => Promise<void>) => {
    await new Promise((resolve) => watching.close(resolve))
    await whileClosed?.()
    const reopened = builds.length
    watching = compiler.watch({ aggregateTimeout: 50 }, onBuild)
    await until(
      () => builds.length > reopened,
      () => 'no first build of the reopened watching',
      waitForBuild,
    )
  }

  const routerOf = (exports: Record<string, any>, pathname = '/') => {
    const {
      createMemoryHistory,
      createRouter,
    } = require('@tanstack/react-router')
    const router = createRouter({
      routeTree: exports.routeTree,
      history: createMemoryHistory({ initialEntries: [pathname] }),
    })
    const routes: Array<string> = Object.values(router.routesById)
      .map((route: any) => `${route.id} < ${route.parentRoute?.id ?? ''}`)
      .sort()
    return { router, routes }
  }
  const run = async (pathname: string) => {
    const { RouterProvider } = require('@tanstack/react-router')
    const { router, routes } = routerOf(load(), pathname)
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
  return {
    file,
    builds,
    waitForBuild,
    run,
    routesOf: (build) => routerOf(build.exports!).routes,
    reopen,
    close: () => close(),
  }
}
