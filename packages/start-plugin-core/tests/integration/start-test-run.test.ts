/**
 * The Vite server a test runner creates for a project that uses Start
 * (`startViteTestServer`): `tanstackStart()` compiles the project's code as in
 * the app, but does not serve the app. So a package that only uses Start's
 * compile-time APIs needs neither a router entry nor routes, and a test run
 * leaves the project's route files alone.
 */
import path from 'node:path'
import { isRunnableDevEnvironment } from 'vite'
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  appFiles,
  createStartApp,
  startViteTestServer,
  until,
  watcherReady,
} from './start-app'
import type { ViteDevServer } from 'vite'

const timeout = 60_000

const head = `import { createFileRoute } from '@tanstack/react-router'\n`

const serverOnly = `export const secret = 'MARK_SECRET'\n`

/** The code of a module of the app, as the client or the server gets it. */
async function compiled(
  server: ViteDevServer,
  environment: 'client' | 'ssr',
  file: string,
) {
  const result = await server.environments[environment]!.transformRequest(
    `/${file}`,
  )
  return result!.code
}

/** Loads a module on the server, as a test runner loads a test file. */
function importOnServer(server: ViteDevServer, id: string) {
  const environment = server.environments.ssr!
  if (!isRunnableDevEnvironment(environment)) {
    throw new Error('The server environment cannot run modules.')
  }
  return environment.runner.import(id)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a package without a router entry and without routes', () => {
  const files = {
    'src/server-only.ts': serverOnly,
    'src/runtime.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
import { secret } from './server-only'
export const where = createIsomorphicFn()
  .server(() => 'MARK_SERVER ' + secret)
  .client(() => 'MARK_CLIENT')
`,
  }

  // The config of an app was planned, which needs a router entry:
  // "Could not resolve entry for router entry: router in <root>/src".
  test(
    "the client gets the client's code and the server gets the server's",
    async () => {
      const app = await createStartApp(files, 'start-library-', [
        'react',
        'react-dom',
      ])
      const { server } = await startViteTestServer(app)

      const client = await compiled(server, 'client', 'src/runtime.ts')
      expect(client).toContain('MARK_CLIENT')
      expect(client).not.toContain('MARK_SERVER')
      expect(client).not.toContain('server-only')

      const ssr = await compiled(server, 'ssr', 'src/runtime.ts')
      expect(ssr).toContain('MARK_SERVER')
      expect(ssr).toContain('server-only')
      expect(ssr).not.toContain('MARK_CLIENT')
    },
    timeout,
  )

  test(
    'the client code of a server function has no handler',
    async () => {
      const app = await createStartApp(
        {
          'src/greeting.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn({ method: 'POST' }).handler(() => 'MARK_HANDLER')
`,
        },
        'start-library-',
        ['react', 'react-dom'],
      )
      const { server } = await startViteTestServer(app)

      const client = await compiled(server, 'client', 'src/greeting.ts')
      expect(client).not.toContain('MARK_HANDLER')
    },
    timeout,
  )

  // Start's server code imports the router entry. In a package without one,
  // Vite could not load that code at all: 'Missing "#tanstack-router-entry"
  // specifier in "@tanstack/start-server-core" package'.
  test(
    "a server module that uses Start's server helpers loads",
    async () => {
      const app = await createStartApp(
        {
          'src/session.ts': `import { getCookie } from '@tanstack/react-start/server'
export const readSession = () => getCookie('session')
`,
        },
        'start-library-',
      )
      const { server } = await startViteTestServer(app)

      const session = await importOnServer(server, '/src/session.ts')

      expect(session.readSession).toBeTypeOf('function')
    },
    timeout,
  )

  // The route generator ran for every project: it logged an error for the
  // missing routes directory.
  test(
    'no route tree is generated and nothing is logged',
    async () => {
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      const app = await createStartApp(files, 'start-library-', [
        'react',
        'react-dom',
      ])
      const { warnings } = await startViteTestServer(app)

      await expect(app.read('src/routeTree.gen.ts')).rejects.toThrow('ENOENT')
      expect(error).not.toHaveBeenCalled()
      expect(warnings).toEqual([])
    },
    timeout,
  )

  // Start asked Vite to pre-bundle `@tanstack/react-store` by a path through
  // `@tanstack/react-router`, which only resolves from a project that
  // depends on the router itself. Vite warned ("Failed to resolve
  // dependency"), and a browser got the store's CommonJS dependency as it is.
  test(
    'that depends on Start only: Vite pre-bundles what the router Start uses loads in a browser',
    async () => {
      const app = await createStartApp(files, 'start-library-', [
        'react',
        'react-dom',
      ])
      const { server, warnings } = await startViteTestServer(app, {}, true)

      expect(warnings).toEqual([])
      const preBundled = server.environments.client.depsOptimizer!.metadata
      expect(
        preBundled.depInfoList.filter((dep) =>
          dep.id.endsWith('> @tanstack/react-store'),
        ),
      ).toHaveLength(1)
      // Router Core's dependencies were found only when a test imported them.
      // Vite then pre-bundled them and reloaded the page, and Vitest's browser
      // mode could lose a test iframe to that reload.
      expect(
        preBundled.depInfoList
          .map((dep) => dep.id.split(' > ').at(-1))
          .filter((id) =>
            ['cookie-es', 'seroval', 'seroval-plugins/web'].includes(id!),
          )
          .sort(),
      ).toEqual(['cookie-es', 'seroval', 'seroval-plugins/web'])
    },
    timeout,
  )

  // Vue Start named `@tanstack/vue-store` by a path through
  // `@tanstack/vue-router` too. Vite warned, found the store when a test first
  // imported the router, pre-bundled it then and reloaded the page.
  test(
    'that depends on Vue Start only: Vite pre-bundles the store of the router Start uses',
    async () => {
      const app = await createStartApp(
        {
          'src/runtime.ts': `import { createIsomorphicFn } from '@tanstack/vue-start'
export const where = createIsomorphicFn()
  .server(() => 'MARK_SERVER')
  .client(() => 'MARK_CLIENT')
`,
        },
        'start-library-',
        ['vue'],
        'vue',
      )
      const { server, warnings } = await startViteTestServer(app, {}, true)

      expect(warnings).toEqual([])
      const preBundled = server.environments.client.depsOptimizer!.metadata
      expect(
        preBundled.depInfoList.filter((dep) =>
          dep.id.endsWith('> @tanstack/vue-store'),
        ),
      ).toHaveLength(1)
    },
    timeout,
  )

  // Only the modules the route generator found lost their server-only route
  // options in client code, and no generator runs for this package.
  test(
    'a route module loses its server-only options in client code',
    async () => {
      const app = await createStartApp({
        'src/server-only.ts': serverOnly,
        'src/widget.tsx': `${head}import { secret } from './server-only'
export const Route = createFileRoute('/widget')({
  server: { handlers: { GET: () => new Response('MARK_HANDLER ' + secret) } },
  headers: () => ({ 'x-mark': 'MARK_HEADERS' }),
  ssr: false,
  loader: () => 'MARK_LOADER',
  component: () => 'MARK_COMPONENT',
})
`,
      })
      const { server } = await startViteTestServer(app)

      const client = await compiled(server, 'client', 'src/widget.tsx')
      expect(client).toContain('MARK_LOADER')
      expect(client).toContain('MARK_COMPONENT')
      expect(client).not.toContain('MARK_HANDLER')
      expect(client).not.toContain('MARK_HEADERS')
      expect(client).not.toContain('ssr:')
      expect(client).not.toContain('server-only')

      const ssr = await compiled(server, 'ssr', 'src/widget.tsx')
      expect(ssr).toContain('MARK_HANDLER')
      expect(ssr).toContain('MARK_HEADERS')
      expect(ssr).toContain('server-only')
    },
    timeout,
  )
})

describe('an app with routes', () => {
  /** What the generator logged as a warning. */
  function generatorWarnings() {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    return () => warn.mock.calls.map((args) => args.join(' ')).join('\n')
  }

  test(
    'the route tree is generated when the server starts',
    async () => {
      const app = await createStartApp(
        appFiles({
          'src/routes/about.tsx': `${head}export const Route = createFileRoute('/about')({ component: () => 'MARK_ABOUT' })\n`,
        }),
      )
      await startViteTestServer(app)

      expect(await app.read('src/routeTree.gen.ts')).toContain(`'/about'`)
    },
    timeout,
  )

  // A dev server and a build update the route path of a route file that was
  // moved, and fill an empty route file. A test run does not edit sources.
  test(
    'route files are left as they are, with a warning',
    async () => {
      const stale = `${head}export const Route = createFileRoute('/moved-from')({ component: () => 'MARK_MOVED' })\n`
      const app = await createStartApp(
        appFiles({
          'src/routes/moved.tsx': stale,
          'src/routes/empty.tsx': '',
        }),
      )
      const logged = generatorWarnings()
      await startViteTestServer(app)

      expect(await app.read('src/routes/moved.tsx')).toBe(stale)
      expect(await app.read('src/routes/empty.tsx')).toBe('')
      // (the tree has the route by its location and leaves out the empty file)
      const routeTree = await app.read('src/routeTree.gen.ts')
      expect(routeTree).toContain(`'/moved'`)
      expect(routeTree).not.toContain('moved-from')
      expect(routeTree).not.toContain('empty')
      expect(logged()).toContain(
        `Route file "${path.join(app.root, 'src/routes/moved.tsx')}" is out of date`,
      )
      expect(logged()).toContain(
        `Route file "${path.join(app.root, 'src/routes/empty.tsx')}" is empty`,
      )
    },
    timeout,
  )

  test(
    'a route added while the server runs does not change the route tree',
    async () => {
      const app = await createStartApp(appFiles())
      const { server } = await startViteTestServer(app)
      const routeTree = await app.read('src/routeTree.gen.ts')
      await watcherReady(app, server, 'src/routes')

      const added = path.join(app.root, 'src/routes/added.tsx')
      let seen = false
      server.watcher.on('all', (_event, file) => {
        seen ||= path.resolve(file) === added
      })
      await app.write({
        'src/routes/added.tsx': `${head}export const Route = createFileRoute('/added')({ component: () => 'MARK_ADDED' })\n`,
      })
      await until(() => Promise.resolve(seen), 'the file watcher of the route')
      // (a dev server writes the tree within this time)
      await new Promise((resolve) => setTimeout(resolve, 1_000))

      expect(await app.read('src/routeTree.gen.ts')).toBe(routeTree)
    },
    timeout,
  )

  // A route file the generator knows is compiled as in the app: its
  // components are split out of client code, and its server-only options go.
  test(
    'a route file is code-split and loses its server-only options in client code',
    async () => {
      const app = await createStartApp(
        appFiles({
          'src/server-only.ts': serverOnly,
          'src/routes/api.tsx': `${head}import { secret } from '../server-only'
export const Route = createFileRoute('/api')({
  server: { handlers: { GET: () => new Response('MARK_HANDLER ' + secret) } },
  component: () => 'MARK_COMPONENT',
})
`,
        }),
      )
      const { server } = await startViteTestServer(app)

      const client = await compiled(server, 'client', 'src/routes/api.tsx')
      expect(client).toContain('tsr-split=component')
      expect(client).not.toContain('MARK_COMPONENT')
      expect(client).not.toContain('MARK_HANDLER')
      expect(client).not.toContain('server-only')

      const ssr = await compiled(server, 'ssr', 'src/routes/api.tsx')
      expect(ssr).toContain('MARK_HANDLER')
      expect(ssr).toContain('server-only')
    },
    timeout,
  )
})
