/**
 * Routes created while a Vite dev server runs: a route file the generator
 * cannot handle yet is reported and is added once fixed (the Vite
 * counterpart of the Rsbuild cases in rsbuild-dev-server-generator.test.ts),
 * and an edit of a created route a page loaded is a hot update.
 */
import react from '@vitejs/plugin-react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { describeHmr } from '@tanstack/compiler-test-utils/dev-server'
import { routerDevServer, routerPackageStub } from './dev-server'
import type { DevServer } from '@tanstack/compiler-test-utils/dev-server'

const timeout = 30_000

/** A route file whose component renders `text`. */
const route = (path: string, text: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('${path}')({
  component: Page,
})
function Page() {
  return <p>${text}</p>
}
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

// Source: gap DV4 (gaps/dev-hmr.md).
describe('route generator failures in Vite dev', () => {
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
    'a route file broken by an edit is reported, and fixing it brings the route back',
    async () => {
      const logs = spyOnLogs()
      const server = await routerDevServer({
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'routes/posts.tsx': route('/posts', 'MARK_POSTS'),
        },
      })
      await server.edit({ 'routes/posts.tsx': 'export const Route = (' })
      expect(logs()).toContain('posts.tsx')

      await server.edit({ 'routes/posts.tsx': route('/posts', 'MARK_FIXED') })
      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_FIXED'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      await expectComponentSplit(server, '/routes/posts.tsx', 'MARK_FIXED')
    },
    timeout,
  )

  // Control of the Rsbuild pins (rsbuild-dev-server-generator.test.ts).
  test.each([
    { name: 'cannot parse', initial: 'export const Route = (' },
    {
      name: 'finds no Route export in',
      initial: `import { createFileRoute } from '@tanstack/react-router'\n`,
    },
  ])(
    'a created route file the generator $name is reported, and fixing it adds the route',
    async ({ initial }) => {
      const logs = spyOnLogs()
      const server = await routerDevServer({
        files: { 'routes/index.tsx': route('/', 'MARK_INDEX') },
      })
      await server.edit({ 'routes/posts.tsx': initial })
      expect(logs()).toContain('posts.tsx')
      expect(await routeTreePaths(server)).toEqual(['/'])

      await server.edit({ 'routes/posts.tsx': route('/wrong', 'MARK_POSTS') })
      expect(await server.read('routes/posts.tsx')).toBe(
        route('/posts', 'MARK_POSTS'),
      )
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])
      await expectComponentSplit(server, '/routes/posts.tsx', 'MARK_POSTS')
    },
    timeout,
  )
})

// Source: gap DV17 (gaps/dev-hmr.md): a route created in dev joins HMR like
// the routes the server started with.
describe('created routes in Vite dev', () => {
  test(
    'an edit of a created route a page loaded is a hot update',
    async () => {
      const server = await routerDevServer({
        plugins: [routerPackageStub('react'), react()],
        files: {
          'routes/index.tsx': route('/', 'MARK_INDEX'),
          'entry.ts': `export { routeTree } from './routeTree.gen'`,
        },
      })
      // The router package stub is a virtual module (`/@id/...`).
      const skip = /^\/@id\/|\/node_modules\/|^\/@(vite|react-refresh)\b/
      await server.load('/entry.ts', { skip })
      await server.edit({ 'routes/posts.tsx': route('/posts', 'MARK_POSTS') })
      expect(await routeTreePaths(server)).toEqual(['/', '/posts'])

      // The page loads the new route tree, the route and its component
      const loaded = await server.load('/entry.ts', { skip })
      expect(Object.keys(loaded)).toContain('/routes/posts.tsx')
      for (const url of dynamicImports(loaded['/routes/posts.tsx']!)) {
        await server.load(url, { skip })
      }

      const messages = describeHmr(
        (
          await server.edit({
            'routes/posts.tsx': route('/posts', 'MARK_EDITED'),
          })
        ).filter((message) => message.environment === 'client'),
      )
      expect(
        messages.some((message) => message.startsWith('client: update')),
      ).toBe(true)
      expect(
        messages.filter((message) => message.startsWith('client: full-reload')),
      ).toEqual([])
      await expectComponentSplit(server, '/routes/posts.tsx', 'MARK_EDITED')
    },
    timeout,
  )
})
