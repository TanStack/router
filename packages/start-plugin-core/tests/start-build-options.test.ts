/**
 * Documented Start plugin options have their effect in real builds, through
 * Start's Vite and Rsbuild plugins (build-harness.ts).
 */
import { describe, expect, test } from 'vitest'
import {
  buildStart,
  routerRuntimeFiles,
  startBundlers,
  startRuntimeFiles,
} from './build-harness'

const timeout = 60_000

/**
 * The stand-in client RPC, with the URL the real one
 * (`@tanstack/start-client-core` `createClientRpc`) calls.
 */
const clientRpcWithUrl = {
  ...startRuntimeFiles,
  'node_modules/@tanstack/react-start/client-rpc.js': `export const createClientRpc = (id) =>
  Object.assign(() => {}, {
    functionId: id,
    url: process.env.TSS_SERVER_FN_BASE + id,
  })
`,
}

const greetFiles = {
  ...clientRpcWithUrl,
  'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'MARK_HANDLER')
`,
  'src/client-entry.ts': `export { greet } from './fns'\n`,
  // The server-fn HTTP handler routes requests under this base
  // (`@tanstack/start-server-core` `createStartHandler`).
  'src/ssr-entry.ts': `export { greet } from './fns'
export const serverFnBase = () => process.env.TSS_SERVER_FN_BASE
export { getServerFnById } from '#tanstack-start-server-fn-resolver'
`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  // Source: oracle-gaps "Start options never exercised" (serverFns.base).
  test.each([
    { start: {}, base: '/_serverFn/' },
    {
      start: { serverFns: { base: '/rpc' }, router: { basepath: '/app' } },
      base: '/app/rpc/',
    },
  ])(
    'serverFns.base and router.basepath: the client calls $base<id>, the base the server routes',
    async ({ start, base }) => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start,
      })
      const rpc = (
        await client.run(
          `return { id: entry.greet.functionId, url: entry.greet.url }`,
        )
      ).result as { id: string; url: string }
      expect(rpc.url).toBe(`${base}${rpc.id}`)
      expect((await ssr.run(`return entry.serverFnBase()`)).result).toBe(base)
    },
    timeout,
  )

  // Source: oracle-gaps "Start options never exercised"
  // (serverFns.generateFunctionId returning undefined).
  test(
    'serverFns.generateFunctionId returning undefined: the default id, which the SSR build resolves',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: greetFiles,
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
        start: { serverFns: { generateFunctionId: () => undefined } },
      })
      const id = (await client.run(`return entry.greet.functionId`)).result
      expect(id).toEqual(expect.stringMatching(/./))
      expect(
        (
          await ssr.run(
            `return await (await entry.getServerFnById(${JSON.stringify(id)}, { origin: 'client' }))({})`,
          )
        ).result,
      ).toBe('MARK_HANDLER')
    },
    timeout,
  )

  /**
   * What `process.env.NODE_ENV` reads in the SSR build when the server runs
   * with `NODE_ENV=staging`.
   */
  async function serverNodeEnv(staticNodeEnv?: boolean) {
    const { ssr } = await buildStart({
      bundler,
      files: {
        'src/entry.ts': `export const nodeEnv = () => process.env.NODE_ENV\n`,
      },
      entry: 'src/entry.ts',
      start:
        staticNodeEnv === undefined
          ? {}
          : { server: { build: { staticNodeEnv } } },
    })
    return (
      await ssr.run(`process.env.NODE_ENV = 'staging'
return entry.nodeEnv()`)
    ).result
  }

  // Source: oracle-gaps "Start options never exercised"
  // (server.build.staticNodeEnv), docs guide/environment-variables.md.
  test(
    'server.build.staticNodeEnv (default): the server build has the build-time NODE_ENV',
    async () => {
      expect(await serverNodeEnv()).toBe('production')
    },
    timeout,
  )

  // Bug (Rsbuild): only Start's Vite plugin reads `staticNodeEnv`
  // (vite/planning.ts `createViteDefineConfig`); the Rsbuild plugin never
  // does, and Rsbuild replaces `process.env.NODE_ENV` in every build.
  // Impact: on Rsbuild, `staticNodeEnv: false` (documented for both
  // bundlers) has no effect: a build deployed to several environments reads
  // the build-time NODE_ENV everywhere.
  // Source: oracle-gaps "Start options never exercised"; docs
  // guide/environment-variables.md "When to Disable Static Replacement".
  ;(bundler === 'rsbuild' ? test.fails : test)(
    'server.build.staticNodeEnv false: the server build reads NODE_ENV at runtime',
    async () => {
      expect(await serverNodeEnv(false)).toBe('staging')
    },
    timeout,
  )

  /** A route whose component and loader each carry a marker. */
  const routeFiles = {
    ...routerRuntimeFiles,
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
    'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  loader: () => 'MARK_LOADER',
  component: () => 'MARK_COMPONENT',
})
`,
    'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
    'src/entry.ts': `export { getRouter } from './router'\n`,
  }

  // Start passes the router options through to the code splitter (only
  // replacing the options it owns: the route options it deletes from client
  // builds, and HMR). By default the loader stays with the route.
  // Source: oracle-gaps "Start options never exercised"
  // (router.codeSplittingOptions through Start).
  test.each([
    {
      name: 'by default',
      router: {},
      expected: { loader: 'eager', component: 'lazy', oneChunk: false },
    },
    {
      name: 'with a defaultBehavior grouping the loader with the component',
      router: {
        codeSplittingOptions: {
          defaultBehavior: [['loader', 'component']] as Array<
            Array<'loader' | 'component'>
          >,
        },
      },
      expected: { loader: 'lazy', component: 'lazy', oneChunk: true },
    },
  ])(
    'router.codeSplittingOptions: the client loads the route loader and component $name',
    async ({ router, expected }) => {
      const { client } = await buildStart({
        bundler,
        files: routeFiles,
        entry: 'src/entry.ts',
        start: { router },
      })
      expect({
        loader: client.where('MARK_LOADER'),
        component: client.where('MARK_COMPONENT'),
        oneChunk:
          client.locate('MARK_LOADER').lazy[0] ===
          client.locate('MARK_COMPONENT').lazy[0],
      }).toEqual(expected)
    },
    timeout,
  )
})
