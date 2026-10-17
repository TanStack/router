/**
 * The route generator on a running Rsbuild dev server (the router plugin's
 * Rspack entry): creating, renaming, moving and deleting route files keeps
 * each route file's `createFileRoute(path)` in line with its location (and
 * the rest of the file untouched), the route tree in line with the route
 * files and the emitted client chunks in line with the route tree, without
 * compile errors; a new route's component is emitted in a chunk of its own.
 * The Rsbuild counterpart of dev-server-generator.test.ts. Also the
 * generator entries of webpack and Rspack in their compilers' watch mode.
 */
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, onTestFinished, test, vi } from 'vitest'
import { routerRsbuildDevServer } from './rsbuild-dev-server'
import type { RouterRsbuildDevServer } from './rsbuild-dev-server'

const timeout = 60_000

const harnessDir = path.dirname(fileURLToPath(import.meta.url))

/** A route file whose component renders `text`. */
const route = (path: string, text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${path}')({
  component: () => <p>${text}</p>,
})
`

/** Paths of the routes in the route tree on disk, sorted. */
async function routeTreePaths(server: RouterRsbuildDevServer) {
  const routeTree = await server.read('routeTree.gen.ts')
  return [
    ...new Set(
      [...routeTree.matchAll(/\bfullPath: '([^']*)'/g)].map(
        (match) => match[1]!,
      ),
    ),
  ].sort()
}

/**
 * Asserts that `text` (a route component's) is emitted by the last compile
 * in exactly one chunk, which the entry loads on demand.
 */
async function expectComponentSplit(
  server: RouterRsbuildDevServer,
  text: string,
) {
  const chunks = await server.chunks()
  expect(
    chunks.filter((chunk) => chunk.initial && chunk.code.includes(text)),
  ).toEqual([])
  expect(
    chunks.filter((chunk) => !chunk.initial && chunk.code.includes(text)),
  ).toHaveLength(1)
}

/** The code of every chunk the last compile emitted, joined. */
async function emitted(server: RouterRsbuildDevServer) {
  return (await server.chunks()).map((chunk) => chunk.code).join('\n')
}

describe('route generator in Rsbuild dev', () => {
  test(
    'a created empty route file is scaffolded, added to the route tree and code-split',
    async () => {
      const server = await routerRsbuildDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      await server.edit({ 'routes/posts.tsx': '' })

      expect(await server.read('routes/posts.tsx')).toContain(
        "createFileRoute('/posts')",
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'Hello "/posts"')
    },
    timeout,
  )

  test(
    'a created route file with another path gets its own path and keeps its code',
    async () => {
      const server = await routerRsbuildDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      await server.edit({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })

      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_POSTS'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_POSTS')
      expect(await emitted(server)).not.toContain('/wrong')
    },
    timeout,
  )

  // Source: issues #4437 (rename), #4440 (Rsbuild).
  test(
    'a renamed route file gets its new path and keeps its code',
    async () => {
      const server = await routerRsbuildDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/about.tsx': route('/about', 'MARK_ABOUT'),
        },
      })
      await expectComponentSplit(server, 'MARK_ABOUT')
      await server.rename('routes/about.tsx', 'routes/info.tsx')
      await server.settle()

      expect(await server.read('routes/info.tsx')).toBe(
        route('/info', 'MARK_ABOUT'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/info'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_ABOUT')
      const code = await emitted(server)
      expect(code).toContain('routes/info.tsx')
      expect(code).not.toContain('routes/about.tsx')
      expect(code).not.toContain("'/about'")
    },
    timeout,
  )

  // Source: issue #4343 (moving a route file into a folder), #4389.
  test(
    'a route file moved into a folder and renamed to its index gets each new path',
    async () => {
      const server = await routerRsbuildDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/hi.tsx': route('/hi', 'MARK_HI'),
        },
      })
      await server.rename('routes/hi.tsx', 'routes/test/hi.tsx')
      await server.settle()
      expect(await server.read('routes/test/hi.tsx')).toBe(
        route('/test/hi', 'MARK_HI'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/test/hi'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_HI')
      expect(await emitted(server)).not.toContain('routes/hi.tsx')

      await server.rename('routes/test/hi.tsx', 'routes/test/index.tsx')
      await server.settle()
      expect(await server.read('routes/test/index.tsx')).toBe(
        route('/test/', 'MARK_HI'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/test/'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_HI')
      const code = await emitted(server)
      expect(code).toContain('routes/test/index.tsx')
      expect(code).not.toContain('routes/test/hi.tsx')
    },
    timeout,
  )

  // Source: issues #4445, #4459 (deleted route file, Rsbuild).
  test(
    'a deleted route file leaves the route tree and the output',
    async () => {
      const server = await routerRsbuildDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/bar.tsx': route('/bar', 'MARK_BAR'),
        },
      })
      await expectComponentSplit(server, 'MARK_BAR')
      await server.edit({ 'routes/bar.tsx': null })

      expect(await routeTreePaths(server)).toEqual(['/'])
      expect(server.errors()).toEqual([])
      const code = await emitted(server)
      expect(code).not.toContain('MARK_BAR')
      expect(code).not.toContain('routes/bar.tsx')
      await expectComponentSplit(server, 'MARK_INDEX')
    },
    timeout,
  )

  // Source: gap DV5 (gaps/dev-hmr.md), issue #6775 (reload loop).
  test(
    'editing a route file without changing the routes does not rewrite the route tree',
    async () => {
      const server = await routerRsbuildDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      const routeTreeFile = path.join(server.root, 'routeTree.gen.ts')
      const routeTree = await server.read('routeTree.gen.ts')
      const { mtimeMs } = await stat(routeTreeFile)
      await server.edit({ 'routes/index.tsx': route('/', 'MARK_EDITED') })

      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_EDITED')
      expect(await server.read('routeTree.gen.ts')).toBe(routeTree)
      expect((await stat(routeTreeFile)).mtimeMs).toBe(mtimeMs)
    },
    timeout,
  )
})

// Source: gap DV4 (gaps/dev-hmr.md): a route file the generator cannot
// handle is reported, the dev server keeps running, and fixing the file
// brings the route back.
describe('route generator failures in Rsbuild dev', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  /** What was logged with `console.error` or `console.warn` since the call. */
  function spyOnLogs() {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    return () =>
      [...error.mock.calls, ...warn.mock.calls]
        .map((args) => args.map(String).join(' '))
        .join('\n')
  }

  test(
    'a route file broken by an edit is reported, and fixing it recompiles the route',
    async () => {
      const logs = spyOnLogs()
      const server = await routerRsbuildDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/posts.tsx': route('/posts', 'MARK_POSTS'),
        },
      })
      await server.edit({ 'routes/posts.tsx': 'export const Route = (' })
      expect(server.errors()).not.toEqual([])
      expect(logs()).toContain('posts.tsx')

      await server.edit({ 'routes/posts.tsx': route('/posts', 'MARK_FIXED') })
      expect(server.errors()).toEqual([])
      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_FIXED'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      await expectComponentSplit(server, 'MARK_FIXED')
    },
    timeout,
  )

  // Bug: the Rspack (and webpack) generator plugin watches the routes
  // directory itself only for created files; the other route file events
  // reach it through the bundler's watcher, which only watches the modules
  // of the bundle. A created route file the generator leaves out of the
  // route tree (it cannot parse it, or it exports no `Route` yet) is not in
  // the bundle, so the edit that fixes it never runs the generator.
  // Source: packages/router-plugin/src/core/router-generator-plugin.ts:100-102
  // (chokidar `add` only; webpack: :128-130).
  // Impact: on Rsbuild, Rspack and webpack dev servers, a new route file
  // saved before it exports a valid `Route` stays out of the route tree (and
  // keeps the path it was written with) until another route file is created
  // or the dev server restarts. Vite is not affected
  // (dev-server-new-routes.test.ts).
  test.fails.each([
    { name: 'cannot parse', initial: 'export const Route = (' },
    {
      name: 'finds no Route export in',
      initial: `import { createFileRoute } from '@tanstack/react-router'\n`,
    },
  ])(
    'a created route file the generator $name is reported, and fixing it adds the route',
    async ({ initial }) => {
      const logs = spyOnLogs()
      const server = await routerRsbuildDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      await server.edit({ 'routes/posts.tsx': initial })
      expect(logs()).toContain('posts.tsx')
      expect(await routeTreePaths(server)).toEqual(['/'])
      expect(server.errors()).toEqual([])

      await server.edit({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })
      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_POSTS'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      expect(server.errors()).toEqual([])
      await expectComponentSplit(server, 'MARK_POSTS')
    },
    timeout,
  )
})

// The generator entries of webpack and Rspack in the compiler's own watch
// mode (`compiler.watch`, as webpack-dev-server and `--watch` use it).
describe('route generator in webpack and Rspack watch mode', () => {
  /** Waits for `check` to hold, polling. */
  async function until(check: () => Promise<boolean> | boolean, what: string) {
    const deadline = Date.now() + 15_000
    while (!(await check())) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${what}`)
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  test.each(['webpack', 'rspack'] as const)(
    '%s: a created route file is scaffolded and added to the route tree, and closing the watcher stops the generator',
    async (bundler) => {
      const root = await mkdtemp(path.join(harnessDir, '.generator-watch-'))
      let close: () => Promise<unknown> = () => Promise.resolve()
      onTestFinished(async () => {
        await close()
        await rm(root, { recursive: true, force: true })
      })
      const file = (relative: string) => path.join(root, relative)
      const read = (relative: string) => readFile(file(relative), 'utf8')
      await mkdir(file('routes'), { recursive: true })
      await writeFile(
        file('routes/__root.js'),
        `import { createRootRoute } from '@tanstack/react-router'\nexport const Route = createRootRoute({})\n`,
      )
      await writeFile(
        file('main.js'),
        `import { routeTree } from './routeTree.gen.js'\nconsole.log(routeTree)\n`,
      )
      const pluginOptions = {
        target: 'react' as const,
        routesDirectory: file('routes'),
        generatedRouteTree: file('routeTree.gen.js'),
        disableTypes: true,
        disableLogging: true,
      }
      const config = {
        context: root,
        mode: 'development',
        entry: './main.js',
        output: { path: file('dist') },
        externals: {
          '@tanstack/react-router': 'commonjs @tanstack/react-router',
        },
        infrastructureLogging: { level: 'none' },
        stats: 'none',
      }
      let compiler: any
      if (bundler === 'webpack') {
        const { default: webpack } = await import('webpack')
        const { TanStackRouterGeneratorWebpack } =
          await import('../src/webpack')
        compiler = webpack({
          ...config,
          plugins: [TanStackRouterGeneratorWebpack(pluginOptions)],
        } as any)
      } else {
        const { rspack } = await import('@rsbuild/core')
        const { TanStackRouterGeneratorRspack } = await import('../src/rspack')
        compiler = rspack({
          ...config,
          plugins: [TanStackRouterGeneratorRspack(pluginOptions)],
        } as any)
      }
      let builds = 0
      const watching = compiler.watch({ aggregateTimeout: 50 }, () => {
        builds++
      })
      close = () => new Promise((resolve) => watching.close(resolve))
      await until(() => builds > 0, 'the first build')

      await writeFile(file('routes/posts.js'), '')
      await until(
        async () =>
          (await read('routes/posts.js')).includes("createFileRoute('/posts')"),
        'the created route file to be scaffolded',
      )
      await until(
        async () => (await read('routeTree.gen.js')).includes("path: '/posts'"),
        'the route tree to have the created route',
      )

      // Let the compiles the scaffolding caused finish, then close.
      let seen = -1
      await until(async () => {
        const quiet = seen === builds
        seen = builds
        await new Promise((resolve) => setTimeout(resolve, 700))
        return quiet && seen === builds
      }, 'the compiles to settle')
      await close()
      close = () => Promise.resolve()
      // The generator's own watcher closes asynchronously after the
      // compiler's; nothing signals it.
      await new Promise((resolve) => setTimeout(resolve, 300))
      await writeFile(file('routes/after.js'), '')
      await new Promise((resolve) => setTimeout(resolve, 1500))
      expect(await read('routes/after.js')).toBe('')
    },
    30_000,
  )
})
