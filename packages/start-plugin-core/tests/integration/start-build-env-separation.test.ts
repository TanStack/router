/**
 * Start's environment separation in real builds, through Start's Vite and
 * Rsbuild plugins (build-harness.ts): server code never reaches the client
 * bundle, and the server build still runs it. "Server code" is each
 * construct whose server side the client must not get; each one imports a
 * module whose code carries a marker (and whose top-level code sets it), so
 * the marker is in the client bundle as soon as the module is.
 * Route options go through Start's own router plugin wiring (its list of
 * options deleted from client route modules).
 */
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createApp } from '@tanstack/compiler-test-utils/build-harness'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { startCompilerPlugin } from '../../src/vite/start-compiler-plugin/plugin'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  runInRequestContext,
  startBundlers,
  startRuntimeLinks,
} from '../build-harness'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

/**
 * The client's `entry.greet()` sends one request to the server, to the
 * server fn's URL.
 */
async function expectCallsTheServer(client: StartBuild['client']) {
  const called = (
    await client.run(`${requestsOfPrelude}
return { url: entry.greet.url, requests: await requestsOf(entry.greet) }`)
  ).result as { url: string; requests: Array<unknown> }
  expect(called.url).toMatch(/^\/_serverFn\/./)
  expect(called.requests).toEqual([{ url: called.url, method: 'GET' }])
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Whether the SSR build loads the handler eagerly or on demand is left
  // open.
  test(
    'a server function handler is only in the SSR build, and runs there',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(() => 'MARK_HANDLER')
`,
          'entry.ts': `export { greet } from './fns'
`,
        },
      })
      expect(client.where('MARK_HANDLER')).toBe('nowhere')
      expect(ssr.where('MARK_HANDLER')).not.toBe('nowhere')
      expect((await ssr.run(`return await entry.greet()`)).result).toBe(
        'MARK_HANDLER',
      )
      await expectCallsTheServer(client)
    },
    timeout,
  )

  test(
    'an isomorphic function keeps the branch of each build',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'entry.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const where = createIsomorphicFn()
  .server(() => 'MARK_SERVER')
  .client(() => 'MARK_CLIENT')
`,
        },
      })
      expect({
        client: [client.where('MARK_CLIENT'), client.where('MARK_SERVER')],
        ssr: [ssr.where('MARK_CLIENT'), ssr.where('MARK_SERVER')],
      }).toEqual({ client: ['eager', 'nowhere'], ssr: ['nowhere', 'eager'] })
      expect([
        (await client.run(`return entry.where()`)).result,
        (await ssr.run(`return entry.where()`)).result,
      ]).toEqual(['MARK_CLIENT', 'MARK_SERVER'])
    },
    timeout,
  )

  /** A library in `node_modules` whose module is `code`, built for Start. */
  const library = (name: string, code: string) => ({
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: './index.js',
      peerDependencies: { '@tanstack/react-start': '*' },
    }),
    [`node_modules/${name}/index.js`]: code,
  })

  // Source: lost-cases-campaign item 13 (a), no test built a server fn
  // defined in node_modules through Start's plugin.
  test(
    "a library's server fn: the client gets an RPC without the handler, and the SSR build runs it by that id",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        // The app depends on the library, as an installed one.
        packageJson: {
          name: 'app',
          private: true,
          type: 'module',
          dependencies: { 'server-fn-lib': '*' },
        },
        files: {
          ...library(
            'server-fn-lib',
            `import { createServerFn } from '@tanstack/react-start'
export const libFn = createServerFn().handler(async () => 'MARK_LIB_HANDLER')
`,
          ),
          'src/client-entry.ts': `export { libFn } from 'server-fn-lib'\n`,
          'src/ssr-entry.ts': `export { libFn } from 'server-fn-lib'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(client.where('MARK_LIB_HANDLER')).toBe('nowhere')
      const id = (await client.run(`return entry.libFn.serverFnMeta.id`)).result
      expect(id).toEqual(expect.any(String))
      const { result } = await ssr.run(`${callByIdPrelude}return {
  called: await entry.libFn(),
  byId: await callById(${JSON.stringify(id)}),
}`)
      expect(result).toEqual({
        called: 'MARK_LIB_HANDLER',
        byId: 'MARK_LIB_HANDLER',
      })
    },
    timeout,
  )

  describe('server code of each construct', () => {
    /**
     * `src/deps/<name>.ts`: an export returning `marker`, in a module whose
     * top-level code also sets it.
     */
    const dependency = (name: string, marker: string) => ({
      [`src/deps/${name}.ts`]: `;(globalThis as Record<string, unknown>).${marker} = 'loaded'
export const ${name} = (..._args: Array<unknown>) => '${marker}'
`,
    })

    /**
     * One app with every construct; the client and SSR entries export them
     * (`src/entry.ts`), and import `src/start.ts` and the router
     * (`src/router.ts`) like Start's entries.
     */
    const files = {
      ...dependency('handlerDep', 'MARK_HANDLER_DEP'),
      ...dependency('baseHandlerDep', 'MARK_BASE_HANDLER_DEP'),
      ...dependency('middlewareServer', 'MARK_MIDDLEWARE_SERVER'),
      ...dependency('middlewareValidator', 'MARK_MIDDLEWARE_VALIDATOR'),
      ...dependency('isomorphicServer', 'MARK_ISOMORPHIC_SERVER'),
      ...dependency('serverOnlyDep', 'MARK_SERVER_ONLY'),
      ...dependency('routeHandler', 'MARK_ROUTE_HANDLER'),
      ...dependency('routeHeaders', 'MARK_ROUTE_HEADERS'),
      ...dependency('routeSsr', 'MARK_ROUTE_SSR'),
      ...dependency('routeServerFn', 'MARK_ROUTE_SERVER_FN'),
      ...dependency('serverRouteHandler', 'MARK_SERVER_ROUTE'),
      ...dependency('startMiddleware', 'MARK_START_MIDDLEWARE'),
      ...dependency('builderValidator', 'MARK_BUILDER_VALIDATOR'),
      ...dependency(
        'builderMiddlewareValidator',
        'MARK_BUILDER_MIDDLEWARE_VALIDATOR',
      ),
      ...dependency(
        'builderMiddlewareServer',
        'MARK_BUILDER_MIDDLEWARE_SERVER',
      ),
      // A validator factory: the validator it returns returns the marker.
      'src/deps/typedSchema.ts': `;(globalThis as Record<string, unknown>).MARK_TYPED_VALIDATOR = 'loaded'
export const typedSchema = (_name: string) => (_data: unknown) =>
  'MARK_TYPED_VALIDATOR'
`,
      // Builders stored in variables, and a validator schema that a type
      // alias reads. The middleware module imports no server fn factory:
      // with one, the Rsbuild SSR build fails to resolve its
      // `createMiddleware` import (pin "a module with a middleware and an
      // isomorphic fn builds ..." in known-bugs-start-compiler.test.ts).
      'src/builder-middleware.ts': `import { createMiddleware } from '@tanstack/react-start'
import { builderMiddlewareValidator } from './deps/builderMiddlewareValidator'
import { builderMiddlewareServer } from './deps/builderMiddlewareServer'
const validatedBase = createMiddleware({ type: 'function' }).validator(
  (data: unknown) => builderMiddlewareValidator(data),
)
export const validatedMiddleware = validatedBase.server(({ next }) => next())
const serverBase = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { marker: builderMiddlewareServer() } }),
)
export const serverMiddleware = serverBase.client(({ next }) => next())
`,
      'src/builders.ts': `import { createServerFn } from '@tanstack/react-start'
import { builderValidator } from './deps/builderValidator'
import { typedSchema } from './deps/typedSchema'
const withValidator = createServerFn({ method: 'POST' }).validator(
  (data: unknown) => builderValidator(data),
)
export const validatedFn = withValidator.handler(async ({ data }) => data)
const themeValidator = typedSchema('theme')
type Theme = ReturnType<typeof themeValidator>
export const setTheme = createServerFn({ method: 'POST' })
  .validator(themeValidator)
  .handler(async ({ data }): Promise<Theme> => data)
`,
      // Isomorphic fns whose first link is stored in a variable.
      'src/iso-builders.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
const serverBase = createIsomorphicFn().server(() => 'iso-var-server')
export const isoServerVar = serverBase.client(() => 'iso-var-client')
const clientBase = createIsomorphicFn().client(() => 'iso-var-client')
export const isoClientVar = clientBase.server(() => 'iso-var-server')
`,
      'src/middleware.ts': `import { createMiddleware } from '@tanstack/react-start'
import { middlewareServer } from './deps/middlewareServer'
import { middlewareValidator } from './deps/middlewareValidator'
export const fnMiddleware = createMiddleware({ type: 'function' })
  .validator((data: unknown) => middlewareValidator(data))
  .server(({ next }) => next({ context: { marker: middlewareServer() } }))
`,
      'src/base.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      'src/fns.ts': `import {
  createIsomorphicFn,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
import { base } from './base'
import { fnMiddleware } from './middleware'
import { handlerDep } from './deps/handlerDep'
import { baseHandlerDep } from './deps/baseHandlerDep'
import { isomorphicServer } from './deps/isomorphicServer'
import { serverOnlyDep } from './deps/serverOnlyDep'
export const fn = createServerFn()
  .middleware([fnMiddleware])
  .handler(async () => handlerDep())
export const fromBase = base.handler(async () => baseHandlerDep())
export const isomorphic = createIsomorphicFn()
  .server(() => isomorphicServer())
  .client(() => 'MARK_ISOMORPHIC_CLIENT')
export const serverOnly = createServerOnlyFn(() => serverOnlyDep())
`,
      'src/start.ts': `import { createMiddleware, createStart } from '@tanstack/react-start'
import { startMiddleware } from './deps/startMiddleware'
const marker = createMiddleware().server(({ next }) =>
  next({ context: { marker: startMiddleware() } }),
)
export const startInstance = createStart(() => ({ requestMiddleware: [marker] }))
`,
      'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
      'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { routeHandler } from '../deps/routeHandler'
import { routeHeaders } from '../deps/routeHeaders'
import { routeSsr } from '../deps/routeSsr'
import { routeServerFn } from '../deps/routeServerFn'
const getData = createServerFn().handler(async () => routeServerFn())
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => routeHandler() } },
  headers: () => ({ 'x-marker': routeHeaders() }),
  ssr: () => routeSsr() === 'MARK_ROUTE_SSR',
  loader: () => getData(),
  component: () => 'MARK_ROUTE_COMPONENT',
})
`,
      'src/routes/api.ts': `import { createFileRoute } from '@tanstack/react-router'
import { serverRouteHandler } from '../deps/serverRouteHandler'
export const Route = createFileRoute('/api')({
  server: { handlers: { GET: () => serverRouteHandler() } },
})
`,
      'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
      'src/entry.ts': `export { fn, fromBase, isomorphic, serverOnly } from './fns'
export { setTheme, validatedFn } from './builders'
export { isoClientVar, isoServerVar } from './iso-builders'
export { serverMiddleware, validatedMiddleware } from './builder-middleware'
export { fnMiddleware } from './middleware'
export { startInstance } from './start'
export { getRouter } from './router'
`,
      // The server-fn HTTP handler calls server fns through the resolver.
      'src/ssr-entry.ts': `export * from './entry'
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
    }

    /** SSR script prelude: `route(id)` is the route with that id. */
    const routes = `const route = (id) =>
  Object.values(entry.getRouter().routeTree.children).find(
    (candidate) => candidate.options.id === id,
  )
const next = (options) => options
`

    // One build for every row.
    let build: StartBuild
    let dispose: (() => Promise<void>) | undefined
    beforeAll(async () => {
      build = await buildStart({
        bundler,
        files,
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        registerCleanup: (cleanup) => {
          dispose = cleanup
        },
      })
    }, timeout)
    afterAll(() => dispose?.())

    // The markers are searchable: the client keeps the client side of the
    // same modules.
    test('the client keeps the client code of these modules', () => {
      expect({
        isomorphic: build.client.where('MARK_ISOMORPHIC_CLIENT'),
        component: build.client.where('MARK_ROUTE_COMPONENT'),
      }).toEqual({ isomorphic: 'eager', component: 'lazy' })
    })

    // Source: holes C1 (Rsbuild), C2 (Start's plugin wiring), C3 (each
    // construct) in round2/oracle-gaps/REPORT.md.
    test.each([
      {
        construct: 'a server fn handler',
        marker: 'MARK_HANDLER_DEP',
        run: `return await entry.fn()`,
        expected: 'MARK_HANDLER_DEP',
      },
      {
        construct:
          'a server fn handler of a builder imported from another module',
        marker: 'MARK_BASE_HANDLER_DEP',
        run: `return await entry.fromBase()`,
        expected: 'MARK_BASE_HANDLER_DEP',
      },
      {
        construct: 'a function middleware .server()',
        marker: 'MARK_MIDDLEWARE_SERVER',
        run: `return entry.fnMiddleware.options.server({ next }).context.marker`,
        expected: 'MARK_MIDDLEWARE_SERVER',
      },
      {
        construct: 'a function middleware validator',
        marker: 'MARK_MIDDLEWARE_VALIDATOR',
        run: `return entry.fnMiddleware.options.validator({})`,
        expected: 'MARK_MIDDLEWARE_VALIDATOR',
      },
      {
        construct: 'an isomorphic fn .server()',
        marker: 'MARK_ISOMORPHIC_SERVER',
        run: `return entry.isomorphic()`,
        expected: 'MARK_ISOMORPHIC_SERVER',
      },
      {
        construct: 'a server-only fn',
        marker: 'MARK_SERVER_ONLY',
        run: `return entry.serverOnly()`,
        expected: 'MARK_SERVER_ONLY',
      },
      {
        construct: 'route server.handlers',
        marker: 'MARK_ROUTE_HANDLER',
        run: `return route('/').options.server.handlers.GET()`,
        expected: 'MARK_ROUTE_HANDLER',
      },
      {
        construct: 'route headers',
        marker: 'MARK_ROUTE_HEADERS',
        run: `return route('/').options.headers()['x-marker']`,
        expected: 'MARK_ROUTE_HEADERS',
      },
      {
        construct: 'route ssr',
        marker: 'MARK_ROUTE_SSR',
        run: `return route('/').options.ssr()`,
        expected: true,
      },
      {
        construct: 'a server fn of a route file the loader calls',
        marker: 'MARK_ROUTE_SERVER_FN',
        run: `return await route('/').options.loader()`,
        expected: 'MARK_ROUTE_SERVER_FN',
      },
      {
        construct: 'a server route',
        marker: 'MARK_SERVER_ROUTE',
        run: `return route('/api').options.server.handlers.GET()`,
        expected: 'MARK_SERVER_ROUTE',
      },
      {
        construct: 'a request middleware of src/start.ts',
        marker: 'MARK_START_MIDDLEWARE',
        run: `return entry.startInstance.getOptions().requestMiddleware[0].options.server({ next }).context.marker`,
        expected: 'MARK_START_MIDDLEWARE',
      },
      {
        construct: 'a function middleware .server() on a builder variable',
        marker: 'MARK_BUILDER_MIDDLEWARE_SERVER',
        run: `return entry.serverMiddleware.options.server({ next }).context.marker`,
        expected: 'MARK_BUILDER_MIDDLEWARE_SERVER',
      },
    ])(
      '$construct: its server code is not in the client bundle, and runs in the SSR build',
      async ({ marker, run, expected }) => {
        expect(build.client.where(marker)).toBe('nowhere')
        expect((await build.ssr.run(`${routes}${run}`)).result).toEqual(
          expected,
        )
      },
    )

    // Bug: a `.validator()` link on a builder stored in a variable is not
    // stripped from the client (server fn and middleware): the chain walk
    // stops at the identifier. Pinned at compiler level in
    // createServerFn/caller-dead-code.test.ts and
    // start-compiler-factories.test.ts.
    // Source: start-compiler/compiler.ts:1296-1330; fuzzing (oracle mode, N4).
    // Bug: a validator schema that a type alias reads with `typeof` stays in
    // the client output with its initializer. The root cause is upstream
    // (babel-dead-code-elimination 1.0.12 counts a `typeof` type query as a
    // reference; no workaround here). Pinned at compiler level in
    // known-bugs-start-compiler.test.ts.
    // Source: router-utils/src/ast.ts:190; fuzzing (oracle mode, V1).
    // Impact: the validators and what they import load eagerly in the
    // client, which never runs them.
    test.fails.each([
      {
        construct: 'a server fn validator on a builder variable',
        marker: 'MARK_BUILDER_VALIDATOR',
        run: `return await entry.validatedFn({ data: 'input' })`,
        expected: 'MARK_BUILDER_VALIDATOR',
      },
      {
        construct: 'a function middleware validator on a builder variable',
        marker: 'MARK_BUILDER_MIDDLEWARE_VALIDATOR',
        run: `return entry.validatedMiddleware.options.validator({})`,
        expected: 'MARK_BUILDER_MIDDLEWARE_VALIDATOR',
      },
      {
        construct: 'a server fn validator schema that a type alias reads',
        marker: 'MARK_TYPED_VALIDATOR',
        run: `return await entry.setTheme({ data: 'light' })`,
        expected: 'MARK_TYPED_VALIDATOR',
      },
    ])(
      '$construct: its server code is not in the client bundle, and runs in the SSR build',
      async ({ marker, run, expected }) => {
        expect(build.client.where(marker)).toBe('nowhere')
        expect((await build.ssr.run(`${routes}${run}`)).result).toEqual(
          expected,
        )
      },
    )

    /** What `run` returns in the client and in the SSR build. */
    const callInBoth = async (run: string) => ({
      client: (await build.client.run(run)).result,
      ssr: (await build.ssr.run(run)).result,
    })

    // Control for the pin below (same build): the inline chain.
    test('an isomorphic fn written as one chain runs its implementation in each build', async () => {
      expect(await callInBoth(`return entry.isomorphic()`)).toEqual({
        client: 'MARK_ISOMORPHIC_CLIENT',
        ssr: 'MARK_ISOMORPHIC_SERVER',
      })
    })

    // Bug: an isomorphic fn whose first link is stored in a variable loses
    // that link's implementation in its environment's build (no-op, returns
    // undefined). Pinned at compiler level in
    // start-compiler-factories.test.ts.
    // Source: start-compiler/handleCreateIsomorphicFn.ts:17-25,
    // start-compiler/compiler.ts:1296-1330; fuzzing (oracle mode, round 2,
    // F3).
    // Impact: the server (or client) call silently returns undefined.
    test.fails.each([
      { name: '.server() link', run: `return entry.isoServerVar()` },
      { name: '.client() link', run: `return entry.isoClientVar()` },
    ])(
      'an isomorphic fn whose $name is stored in a variable runs its implementation in each build',
      async ({ run }) => {
        expect(await callInBoth(run)).toEqual({
          client: 'iso-var-client',
          ssr: 'iso-var-server',
        })
      },
    )

    // An HTTP call of a client RPC runs the server fn of its id. Its own
    // build of the server fns: Start's server entry, which handles the
    // call, renders with the real `@tanstack/react-router`, not the shared
    // build's stand-in.
    // Source: mutation round 3 sc-hosts 1 (no Rsbuild build made the
    // compiler load another module, here the builder's).
    test(
      'each server fn of the client runs by its id in the SSR build',
      async () => {
        const fnFiles = [
          'src/deps/handlerDep.ts',
          'src/deps/baseHandlerDep.ts',
          'src/deps/middlewareServer.ts',
          'src/deps/middlewareValidator.ts',
          'src/deps/isomorphicServer.ts',
          'src/deps/serverOnlyDep.ts',
          'src/deps/startMiddleware.ts',
          'src/middleware.ts',
          'src/base.ts',
          'src/fns.ts',
          'src/start.ts',
        ]
        const { client, ssr } = await buildStart({
          bundler,
          files: {
            ...Object.fromEntries(
              fnFiles.map((file) => [
                file,
                (files as Record<string, string>)[file]!,
              ]),
            ),
            'src/ssr-entry.ts': `export * from './fns'
${callByIdExports}`,
          },
          entry: { client: 'src/fns.ts', ssr: 'src/ssr-entry.ts' },
        })
        const ids = (
          await client.run(
            `return [entry.fn.serverFnMeta.id, entry.fromBase.serverFnMeta.id]`,
          )
        ).result
        const { result } = await ssr.run(`${callByIdPrelude}const results = []
for (const id of ${JSON.stringify(ids)}) {
  results.push(await callById(id))
}
return results`)
        expect(result).toEqual(['MARK_HANDLER_DEP', 'MARK_BASE_HANDLER_DEP'])
      },
      timeout,
    )
  })
})

describe("Vite build with Vite's default client target", () => {
  // The harness builds for `esnext`; Vite's default client target
  // (`baseline-widely-available`) lowers newer syntax after Start compiled
  // the module.
  // Source: audit E2 missing coverage #5.
  test(
    'a server function handler is only in the SSR build, and the client calls the server',
    async () => {
      const { client, ssr } = await buildStart({
        files: {
          'fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { secret } from './secret'
export const greet = createServerFn().handler(async () => secret?.() ?? 'MARK_NONE')
export const label = () => 'MARK_CLIENT_LABEL'
`,
          'secret.ts': `export const secret = () => 'MARK_HANDLER'\n`,
          'entry.ts': `export { greet, label } from './fns'\n`,
        },
        viteConfig: {
          environments: {
            client: { build: { target: 'baseline-widely-available' } },
          },
        },
      })
      expect({
        handler: client.where('MARK_HANDLER'),
        label: client.where('MARK_CLIENT_LABEL'),
      }).toEqual({ handler: 'nowhere', label: 'eager' })
      expect((await ssr.run(`return await entry.greet()`)).result).toBe(
        'MARK_HANDLER',
      )
      await expectCallsTheServer(client)
    },
    timeout,
  )
})

describe('Vite: an environment built twice by one builder', () => {
  // `@vitejs/plugin-rsc` runs a scan build of an environment before its real
  // build, with the same plugins: the second build compiles server fns
  // again, including ones whose builder the compiler loads from another
  // module.
  // Source: mutation round 3 sc-hosts 4.
  test(
    'the second build compiles the server fns of its modules',
    async () => {
      const app = await createApp({
        dir: path.dirname(fileURLToPath(import.meta.url)),
        prefix: '.start-build-twice-',
        registerCleanup: onTestFinished,
        symlinks: startRuntimeLinks(),
        files: {
          'src/direct.ts': `import { createServerFn } from '@tanstack/react-start'
export const direct = createServerFn().handler(async () => 'MARK_DIRECT')
`,
          'src/base.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
          'src/fns.ts': `import { base } from './base'
export const greet = base.handler(async () => 'MARK_HANDLER')
`,
        },
      })
      const { createBuilder } = await import('vite')
      /** Entry module of each build of the SSR environment. */
      const inputs = ['src/direct.ts', 'src/fns.ts']
      let builds = 0
      const builder = await createBuilder({
        root: app.root,
        configFile: false,
        logLevel: 'silent',
        environments: {
          client: { build: { outDir: 'dist/client' } },
          // `ssr` names an entry; `build-twice-input` sets each build's
          ssr: { build: { outDir: 'dist/ssr', ssr: inputs[0] } },
        },
        ssr: { noExternal: true },
        builder: {
          async buildApp(appBuilder) {
            for (const _input of inputs) {
              await appBuilder.build(appBuilder.environments.ssr!)
              builds++
            }
          },
        },
        plugins: [
          {
            name: 'build-twice-input',
            applyToEnvironment: (environment) => environment.name === 'ssr',
            options: (options) => ({
              ...options,
              input: path.join(app.root, inputs[builds]!),
            }),
          },
          startCompilerPlugin({
            framework: 'react',
            environments: [
              { name: 'client', type: 'client' },
              { name: 'ssr', type: 'server' },
            ],
            providerEnvName: 'ssr',
          }),
        ],
      })
      await builder.buildApp()
      expect(builds).toBe(2)
      const outDir = path.join(app.root, 'dist/ssr')
      const output = (await readdir(outDir)).find((file) =>
        /^fns\.m?js$/.test(file),
      )
      const { greet } = await import(
        pathToFileURL(path.join(outDir, output!)).href
      )
      expect(typeof greet.serverFnMeta.id).toBe('string')
      expect(await runInRequestContext(() => greet())).toBe('MARK_HANDLER')
    },
    timeout,
  )
})

describe('Rsbuild: a build restored from the persistent cache', () => {
  // With `performance.buildCache`, Rspack restores unchanged modules from
  // its cache without running Start's compiler on them again; Start must
  // still know their server fns.
  // Source: mutation round 3 sc-hosts 9 (e2e apps custom-server-rsbuild and
  // server-functions build with buildCache).
  test(
    'each server fn of the client runs by its id in the SSR build',
    async () => {
      const { client, ssr } = await buildStart({
        bundler: 'rsbuild',
        builds: 2,
        rsbuildConfig: { performance: { buildCache: true } },
        files: {
          'src/base.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { base } from './base'
export const greet = createServerFn().handler(async () => 'MARK_GREET')
export const fromBase = base.handler(async () => 'MARK_FROM_BASE')
`,
          'src/client-entry.ts': `export { greet, fromBase } from './fns'\n`,
          'src/ssr-entry.ts': `export { greet, fromBase } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      expect(client.where(/MARK_GREET|MARK_FROM_BASE/)).toBe('nowhere')
      const ids = (
        await client.run(
          `return [entry.greet.serverFnMeta.id, entry.fromBase.serverFnMeta.id]`,
        )
      ).result
      const { result } = await ssr.run(`${callByIdPrelude}const results = []
for (const id of ${JSON.stringify(ids)}) {
  results.push(await callById(id))
}
return results`)
      expect(result).toEqual(['MARK_GREET', 'MARK_FROM_BASE'])
    },
    timeout,
  )
})
