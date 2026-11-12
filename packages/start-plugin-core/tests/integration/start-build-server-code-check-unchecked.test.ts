/**
 * Server-only text of each kind Start removes from the client (R132: a
 * server fn's handler, a validator, a middleware's server implementation, an
 * isomorphic function's server implementation, a `createServerOnlyFn`
 * body), written in a split loader, so the client's text of it is a split
 * chunk's, and each route option Start erases from the client (`server`,
 * `headers`, `ssr`): the client build holds none of it, and the build
 * reports no error. With the compiler's self-checks off, as in users' builds, where a
 * planner that kept such text would fail the build at it (the server-code
 * check) instead of shipping it. The switch is read once, when the compiler
 * loads: this file runs in a process of its own (project
 * `integration-alone`) and turns it off before anything loads.
 */
import { describe, expect, test, vi } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

vi.hoisted(() => {
  process.env.TSR_COMPILER_VERIFY = '0'
})

const timeout = 60_000

const SECRET = 'MARK_SECRET'

/** The route's loader, split into its own chunk; `body` is its body. */
const routeModule = (body: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
import {
  createIsomorphicFn,
  createMiddleware,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
export const Route = createFileRoute('/')({
  loader: async () => {
${body}
  },
  component: () => 'MARK_COMPONENT',
})
`

const KINDS: Array<{ kind: string; body: string }> = [
  {
    kind: "a server function's handler",
    body: `    const fn = createServerFn().handler(async () => '${SECRET}')
    return fn`,
  },
  {
    kind: "a server function's validator",
    body: `    const fn = createServerFn()
      .validator((data: string) => data + '${SECRET}')
      .handler(async ({ data }) => data)
    return fn`,
  },
  {
    kind: "a middleware's server implementation",
    body: `    const mw = createMiddleware().server(async ({ next }) => {
      console.log('${SECRET}')
      return next()
    })
    return mw`,
  },
  {
    kind: "a middleware's validator",
    body: `    const mw = createMiddleware({ type: 'function' })
      .validator((data: string) => data + '${SECRET}')
      .server(({ next }) => next())
    return mw`,
  },
  {
    kind: "an isomorphic function's server implementation",
    body: `    const where = createIsomorphicFn()
      .server(() => '${SECRET}')
      .client(() => 'client')
    return where()`,
  },
  {
    kind: "a createServerOnlyFn function's body",
    body: `    const only = createServerOnlyFn(() => '${SECRET}')
    return only`,
  },
]

const ROUTE_OPTIONS: Array<{ key: string; option: string }> = [
  {
    key: 'server',
    option: `server: { handlers: { GET: () => new Response('${SECRET}') } }`,
  },
  { key: 'headers', option: `headers: () => ({ 'x-secret': '${SECRET}' })` },
  {
    key: 'ssr',
    option: `ssr: () => (globalThis as any).ssrMode !== '${SECRET}'`,
  },
]

/** A route module with `option` beside its component. */
const routeWithOption = (option: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ${option},
  component: () => 'MARK_COMPONENT',
})
`

describe.each(startBundlers)('%s build', (bundler) => {
  const build = (route: string) =>
    buildStart({
      bundler,
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        'src/routes/index.tsx': route,
        'src/router.ts': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
        'src/client-entry.ts': `export { getRouter } from './router'\n`,
        'src/ssr-entry.ts': `export { getRouter } from './router'\n`,
      },
      entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      start: {
        router: {
          codeSplittingOptions: {
            defaultBehavior: [['loader'], ['component']] as Array<
              Array<'loader' | 'component'>
            >,
          },
        },
      },
    })

  /** The client build holds none of the secret, the SSR build does, and no error is reported. */
  const expectServerOnly = (built: Awaited<ReturnType<typeof build>>) => {
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(built.client.where(SECRET)).toBe('nowhere')
    expect(built.ssr.where(SECRET)).not.toBe('nowhere')
  }

  test.each(KINDS)(
    'the client build of $kind in a split loader holds none of it, without an error',
    async ({ body }) => {
      expectServerOnly(await build(routeModule(body)))
    },
    timeout,
  )

  test.each(ROUTE_OPTIONS)(
    "the client build of a route's `$key` option holds none of it, without an error",
    async ({ option }) => {
      expectServerOnly(await build(routeWithOption(option)))
    },
    timeout,
  )
})
