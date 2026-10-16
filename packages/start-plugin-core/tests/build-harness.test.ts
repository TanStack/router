/**
 * Control tests of the Start build harness (build-harness.ts), with each
 * bundler: what `where()` reports and `run()` runs in each environment,
 * that the builds go through Start's plugin (server fn RPCs and the
 * generated resolver, the route generator and code splitter), and that
 * warnings and errors reach the test.
 */
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { buildStart, routerRuntimeFiles, startBundlers } from './build-harness'

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
    'a server fn is an RPC by id on the client, and the SSR build resolves the same id through the generated resolver',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hello')
`,
          'src/client-entry.ts': `export { greet } from './fns'\n`,
          'src/ssr-entry.ts': `export { greet } from './fns'
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const clientRpc = (
        await client.run(`try {
  entry.greet()
  return 'called'
} catch (error) {
  return { id: entry.greet.functionId, message: error.message }
}`)
      ).result as { id: string; message: string }
      expect(clientRpc.message).toBe(`client RPC ${clientRpc.id}`)
      const { result } = await ssr.run(`const settle = async (run) => {
  try {
    return await run()
  } catch (error) {
    return error.message
  }
}
const id = ${JSON.stringify(clientRpc.id)}
return {
  sameId: entry.greet.functionId === id,
  resolved: await settle(async () => (await entry.getServerFnById(id, { origin: 'server' }))()),
  unknown: await settle(() => entry.getServerFnById('unknown-id', { origin: 'server' })),
}`)
      expect(result).toEqual({
        sameId: true,
        resolved: 'hello',
        unknown: expect.stringMatching(/not found/),
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
          ...routerRuntimeFiles,
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
          'src/entry.ts': `export { getRouter } from './router'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(client.where('MARK_COMPONENT')).toBe('lazy')
      const { result } =
        await ssr.run(`const routes = Object.values(entry.getRouter().routeTree.children)
const component = routes[0].options.component
await component.preload?.()
return { ids: routes.map((route) => route.options.id), rendered: component() }`)
      expect(result).toEqual({ ids: ['/'], rendered: 'MARK_COMPONENT' })
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
