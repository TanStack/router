/**
 * Control tests of the Start build harness (build-harness.ts), with each
 * bundler: what `where()` reports and `run()` runs in each environment,
 * that the builds go through Start's plugin (server fn RPCs and the
 * generated resolver, the route generator and code splitter), and that
 * warnings and errors reach the test.
 */
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 60_000

/** An entry that loads `MARK_EAGER` with it and `MARK_LAZY` on demand. */
const loadingFiles = {
  'src/eager.ts': `export const eager = () => 'MARK_EAGER'\n`,
  'src/lazy.ts': `export const lazy = () => 'MARK_LAZY'\n`,
  'src/entry.ts': `export { eager } from './eager'
export const loadLazy = async () => (await import('./lazy')).lazy()
export const hasDocument = () => typeof document !== 'undefined'
`,
}

describe.each(startBundlers)('%s', (bundler) => {
  test(
    'where() tells code loaded with the entry, on demand and nowhere apart',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      for (const build of [client, ssr]) {
        expect({
          env: build.env,
          eager: build.where('MARK_EAGER'),
          lazy: build.where('MARK_LAZY'),
          absent: build.where('MARK_ABSENT'),
        }).toEqual({
          env: build.env,
          eager: 'eager',
          lazy: 'lazy',
          absent: 'nowhere',
        })
      }
    },
    timeout,
  )

  test(
    "run() runs each environment's entry, with a DOM on the client only",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      const script = `return [entry.hasDocument(), entry.eager(), await entry.loadLazy()]`
      expect({
        client: (await client.run(script)).result,
        ssr: (await ssr.run(script)).result,
      }).toEqual({
        client: [true, 'MARK_EAGER', 'MARK_LAZY'],
        ssr: [false, 'MARK_EAGER', 'MARK_LAZY'],
      })
    },
    timeout,
  )

  test(
    "a server fn is Start's RPC on the client: calling it fetches its URL, which carries its id; the SSR build runs the handler, directly and for a request of that id",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hello')
`,
          'src/client-entry.ts': `export { greet } from './fns'\n`,
          'src/ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      // The client run has no server: `requestsOf` records the requests
      // the call sends.
      const clientRpc = (
        await client.run(`${requestsOfPrelude}
return {
  id: entry.greet.serverFnMeta.id,
  url: entry.greet.url,
  requests: await requestsOf(entry.greet),
}`)
      ).result as {
        id: string
        url: string
        requests: Array<{ url: string; method: string }>
      }
      expect(clientRpc).toEqual({
        id: expect.any(String),
        url: `/_serverFn/${clientRpc.id}`,
        requests: [{ url: clientRpc.url, method: 'GET' }],
      })
      const { result } = await ssr.run(`${callByIdPrelude}
const settle = async (run) => {
  try {
    return await run()
  } catch (error) {
    return error.message
  }
}
const id = ${JSON.stringify(clientRpc.id)}
return {
  sameId: entry.greet.serverFnMeta.id === id,
  called: await settle(() => entry.greet()),
  byId: await settle(() => callById(id)),
  unknown: await settle(() => callById('unknown-id')),
}`)
      expect(result).toEqual({
        sameId: true,
        called: 'hello',
        byId: 'hello',
        unknown: expect.stringMatching(/not found/),
      })
    },
    timeout,
  )

  // The request context is the one piece of Start the harness stands in for
  // (`inRequestContext`): Start's own runtime reads it.
  test(
    'SSR scripts run in a request context that Start’s runtime reads',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const middleware = createMiddleware({ type: 'function' }).server(
  ({ next, context }) =>
    next({ context: { fromMiddleware: 'MARK_MIDDLEWARE', given: context } }),
)
export const inspect = createServerFn()
  .middleware([middleware])
  .handler(async ({ context, method }) => ({ method, context }))
`,
          'src/entry.ts': `export { inspect } from './fns'\n`,
        },
        entry: 'src/entry.ts',
      })
      // Without a request context, Start's runtime throws ("No Start
      // context found").
      expect((await ssr.run(`return await entry.inspect()`)).result).toEqual({
        method: 'GET',
        context: { fromMiddleware: 'MARK_MIDDLEWARE', given: {} },
      })
    },
    timeout,
  )

  test(
    'the route generator and code splitter run: the route tree links a route whose component loads on demand',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  component: () => 'MARK_COMPONENT',
})
`,
          'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
          'src/entry.ts': `export { getRouter } from './router'
export { renderPath } from '../harness/render'
`,
        },
        entry: 'src/entry.ts',
      })
      expect(client.where('MARK_COMPONENT')).toBe('lazy')
      // The real router over the generated tree renders the page at `/`
      // (loading the route's component chunk).
      const { result } = await ssr.run(`const { routeTree } = entry.getRouter()
return {
  ids: Object.values(routeTree.children).map((route) => route.options.id),
  rendered: await entry.renderPath(routeTree, '/'),
}`)
      expect(result).toEqual({
        ids: ['/'],
        rendered: expect.stringContaining('MARK_COMPONENT'),
      })
    },
    timeout,
  )

  test(
    "the bundler's warnings reach the result of each environment, and a clean app has none",
    async () => {
      const warned = await buildStart({
        bundler,
        files: {
          // Vite (Rolldown) warns about direct `eval`, Rspack about an
          // import of an expression.
          'src/warned.ts': `export const evaluate = (code: string) => eval(code)
export const load = (name: string) => import(name)
`,
          'src/entry.ts': `export { evaluate, load } from './warned'\n`,
        },
        entry: 'src/entry.ts',
      })
      const clean = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      const naming = (warnings: Array<string>) =>
        warnings.some((warning) => warning.includes('warned.ts'))
      expect({
        warnedClient: naming(warned.client.warnings),
        warnedSsr: naming(warned.ssr.warnings),
        cleanClient: clean.client.warnings,
        cleanSsr: clean.ssr.warnings,
      }).toEqual({
        warnedClient: true,
        warnedSsr: true,
        cleanClient: [],
        cleanSsr: [],
      })
    },
    timeout,
  )

  test(
    "a failing build rejects with the bundler's errors",
    async () => {
      const failure = await buildStart({
        bundler,
        files: {
          'src/entry.ts': `export { value } from './missing-module'\n`,
        },
        entry: 'src/entry.ts',
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(BuildError)
      expect((failure as BuildError).errors.join('\n')).toMatch(
        /missing-module/,
      )
    },
    timeout,
  )
})
