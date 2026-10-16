/**
 * The route generator on a running Vite dev server: creating, renaming,
 * moving and deleting route files keeps each route file's
 * `createFileRoute(path)` in line with its location (and the rest of the
 * file untouched) and the route tree in line with the route files, and the
 * first request of a new route is code-split.
 */
import { describe, expect, test } from 'vitest'
import { routerDevServer } from './dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

/** A route file whose component renders `text`. */
const route = (path: string, text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${path}')({
  component: () => <p>${text}</p>,
})
`

/** Paths of the routes in the route tree, sorted. */
async function routeTreePaths(server: DevServer) {
  const routeTree = await server.read('routeTree.gen.ts')
  return [
    ...new Set(
      [...routeTree.matchAll(/\bfullPath: '([^']*)'/g)].map(
        (match) => match[1]!,
      ),
    ),
  ].sort()
}

/** URLs a transformed module imports dynamically. */
function dynamicImports(code: string) {
  return [...code.matchAll(/\bimport\("([^"]+)"\)/g)].map((match) => match[1]!)
}

/**
 * Asserts that the client module of a route does not contain `text` (its
 * component's), and that a module it loads on demand does.
 */
async function expectComponentSplit(
  server: DevServer,
  url: string,
  text: string,
) {
  const code = await server.transform(url)
  expect(code).not.toContain(text)
  const lazy = await Promise.all(
    dynamicImports(code).map((imported) => server.transform(imported)),
  )
  expect(lazy.filter((module) => module.includes(text))).toHaveLength(1)
}

/** Waits until `check` returns true, polling. */
async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 10_000
  while (!(await check())) {
    if (Date.now() > deadline) {
      throw new Error('timed out')
    }
    await new Promise((resolve) => setTimeout(resolve, 1))
  }
}

/** Errors the dev server logged. */
const errors = (server: DevServer) =>
  server.logs.filter((log) => log.startsWith('error:'))

describe('route generator in dev', () => {
  test(
    'a created empty route file is scaffolded, added to the route tree and code-split',
    async () => {
      const server = await routerDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      await server.edit({ 'routes/posts.tsx': '' })

      expect(await server.read('routes/posts.tsx')).toContain(
        "createFileRoute('/posts')",
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      await expectComponentSplit(server, '/routes/posts.tsx', 'Hello')
      expect(errors(server)).toEqual([])
    },
    timeout,
  )

  test(
    'a created route file with another path gets its own path and keeps its code',
    async () => {
      const server = await routerDevServer({ files: {} })
      await server.edit({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })

      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_POSTS'),
      )
      expect(await routeTreePaths(server)).toEqual(['/posts'])
      await expectComponentSplit(server, '/routes/posts.tsx', 'MARK_POSTS')
    },
    timeout,
  )

  // Source: issues #4437 (rename), #4440.
  test(
    'a renamed route file gets its new path and keeps its code',
    async () => {
      const server = await routerDevServer({
        files: { 'routes/about.tsx': route('/about', 'MARK_ABOUT') },
      })
      await server.rename('routes/about.tsx', 'routes/info.tsx')
      await server.settle()

      expect(await server.read('routes/info.tsx')).toBe(
        route('/info', 'MARK_ABOUT'),
      )
      expect(await routeTreePaths(server)).toEqual(['/info'])
      await expectComponentSplit(server, '/routes/info.tsx', 'MARK_ABOUT')
      expect(errors(server)).toEqual([])
    },
    timeout,
  )

  // Source: issue #4343 (moving a route file into a folder), #4389.
  test(
    'a route file moved into a folder and renamed to its index gets each new path',
    async () => {
      const server = await routerDevServer({
        files: { 'routes/hi.tsx': route('/hi', 'MARK_HI') },
      })
      await server.rename('routes/hi.tsx', 'routes/test/hi.tsx')
      await server.settle()
      expect(await server.read('routes/test/hi.tsx')).toBe(
        route('/test/hi', 'MARK_HI'),
      )
      expect(await routeTreePaths(server)).toEqual(['/test/hi'])

      await server.rename('routes/test/hi.tsx', 'routes/test/index.tsx')
      await server.settle()
      expect(await server.read('routes/test/index.tsx')).toBe(
        route('/test/', 'MARK_HI'),
      )
      expect(await routeTreePaths(server)).toEqual(['/test/'])
      expect(await server.transform('/routeTree.gen.ts')).toContain(
        '/routes/test/index.tsx',
      )
      expect(errors(server)).toEqual([])
    },
    timeout,
  )

  // Source: issues #4445, #4459 (deleted route file).
  test(
    'a deleted route file leaves the route tree',
    async () => {
      const server = await routerDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/bar.tsx': route('/bar', 'MARK_BAR'),
        },
      })
      await server.load('/routeTree.gen.ts')
      await server.edit({ 'routes/bar.tsx': null })

      expect(await routeTreePaths(server)).toEqual(['/'])
      expect(await server.transform('/routeTree.gen.ts')).not.toContain(
        '/routes/bar.tsx',
      )
      expect(errors(server)).toEqual([])
    },
    timeout,
  )

  // Source: gap DV5 (gaps/dev-hmr.md), issue #6775 (reload loop).
  test(
    'editing a route file without changing the routes does not rewrite the route tree',
    async () => {
      const server = await routerDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      const routeTree = await server.read('routeTree.gen.ts')
      await server.edit({ 'routes/index.tsx': route('/', 'MARK_EDITED') })

      expect(server.events).toEqual([
        { event: 'change', file: 'routes/index.tsx' },
      ])
      expect(await server.read('routeTree.gen.ts')).toBe(routeTree)
    },
    timeout,
  )

  // The route tree update that makes the browser request a new route is
  // only sent once the generator run that wrote the route tree has finished
  // and the plugin knows the new route: the route tree's own file event waits
  // for that run. A watcher reporting the route tree as soon as it is written
  // must not let the new route be served unsplit.
  // Source: gaps DV1/DV17 (gaps/dev-hmr.md), suspected race.
  test(
    'a created route requested as soon as the route tree update is sent is code-split',
    async () => {
      const server = await routerDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'main.ts': `export { routeTree } from './routeTree.gen'\n`,
        },
      })
      await server.load('/main.ts')
      await server.write({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })

      // A fast watcher: the route file's creation, then the route tree's
      // change as soon as the generator has written it
      server.vite.watcher.emit('add', server.file('routes/posts.tsx'))
      await until(async () =>
        (await server.read('routeTree.gen.ts')).includes("'/posts'"),
      )
      const sent = server.hmr.length
      server.vite.watcher.emit('change', server.file('routeTree.gen.ts'))
      await until(() =>
        server.hmr
          .slice(sent)
          .some((message) => message.environment === 'client'),
      )
      await expectComponentSplit(server, '/routes/posts.tsx', 'MARK_POSTS')
      await server.settle()
    },
    timeout,
  )
})
