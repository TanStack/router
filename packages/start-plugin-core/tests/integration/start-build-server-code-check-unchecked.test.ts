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
import { sharedBuildFailure, startBundlers } from '../build-harness'
import { buildStart } from '../build-start'
import type { StartBuild } from '../build-harness'

vi.hoisted(() => {
  process.env.TSR_COMPILER_VERIFY = '0'
})

const SECRET = 'MARK_SECRET'

/** Client code of the loader, wherever the client build puts it. */
const LOADER = 'MARK_LOADER'

/**
 * A server fn's middleware that runs on the client: the server fn's client
 * text holds `LOADER`.
 */
const clientMiddleware = `createMiddleware({ type: 'function' }).client(({ next }) =>
      next({ sendContext: { at: '${LOADER}' } }),
    )`

/**
 * The route's loader, split into its own chunk: `loader` is its value (a
 * server fn, which is created once, when the module loads: R162), or
 * `body` its function's body. Either holds `LOADER` in the client build.
 */
const routeModule = ({ body, loader }: { body?: string; loader?: string }) =>
  `import { createFileRoute } from '@tanstack/react-router'
import {
  createIsomorphicFn,
  createMiddleware,
  createServerFn,
  createServerOnlyFn,
} from '@tanstack/react-start'
export const Route = createFileRoute('/')({
  loader: ${loader ?? `async () => {\n    ;(globalThis as any).loaderRan = '${LOADER}'\n${body}\n  }`},
  component: () => 'MARK_COMPONENT',
})
`

const KINDS: Array<{ kind: string; body?: string; loader?: string }> = [
  {
    kind: "a server function's handler",
    loader: `createServerFn()
    .middleware([${clientMiddleware}])
    .handler(async () => '${SECRET}')`,
  },
  {
    // (untyped: a call with TypeScript syntax stays in the route module, as
    // on main, which reprints the value without the TypeScript plugin)
    kind: "a server function's validator",
    loader: `createServerFn()
    .middleware([${clientMiddleware}])
    .validator((data) => data + '${SECRET}')
    .handler(async ({ data }) => data)`,
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

/** The rows: each a route module, whose text marks its server code `SECRET` and its loader's client code `LOADER`. */
const rows = [
  ...KINDS.map((kind) => ({
    input: kind as object,
    name: kind.kind,
    route: routeModule(kind),
  })),
  ...ROUTE_OPTIONS.map((option) => ({
    input: option as object,
    name: `the \`${option.key}\` option`,
    route: routeWithOption(option.option),
  })),
]

/** The markers of the `index`th row in the shared build. */
const markersOf = (index: number) => ({
  secret: `${SECRET}_R${index}_`,
  loader: `${LOADER}_R${index}_`,
})

describe.each(startBundlers)('%s build', (bundler) => {
  /** An app of `routes` (by path, `/` included or not), each a route module of `src/routes/`. */
  const build = (routes: Record<string, string>) =>
    buildStart({
      bundler,
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute()
`,
        ...Object.fromEntries(
          Object.entries(routes).map(([file, route]) => [
            `src/routes/${file}.tsx`,
            route,
          ]),
        ),
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

  /**
   * Every row in one app, each its route `/r<index>` with markers of its
   * own (`markersOf`); its failure fails each row, naming the rows it names.
   */
  let together: Promise<StartBuild> | undefined
  const sharedBuild = () =>
    (together ??= build(
      Object.fromEntries(
        rows.map(({ route }, index) => {
          const { secret, loader } = markersOf(index)
          return [
            `r${index}`,
            route
              .replace("createFileRoute('/')", `createFileRoute('/r${index}')`)
              .replaceAll(SECRET, secret)
              .replaceAll(LOADER, loader),
          ]
        }),
      ),
    ).catch((error: unknown) => {
      throw sharedBuildFailure(
        error,
        rows.map(({ name }, index) => ({
          path: `src/routes/r${index}.tsx`,
          name,
        })),
      )
    }))

  /** The row's build and markers in the shared build. */
  const builtRow = async (index: number) => ({
    built: await sharedBuild(),
    ...markersOf(index),
  })

  /** The client build holds none of the secret, the SSR build does, and no error is reported. */
  const expectServerOnly = ({
    built,
    secret,
  }: Awaited<ReturnType<typeof builtRow>>) => {
    expect(built.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(built.client.where(secret)).toBe('nowhere')
    expect(built.ssr.where(secret)).not.toBe('nowhere')
  }

  test.each(KINDS)(
    'the client build of $kind in a split loader holds none of it, without an error',
    async (kind) => {
      const row = await builtRow(rows.findIndex((r) => r.input === kind))
      expect(row.built.client.where(row.loader), 'the loader').toBe('lazy')
      expectServerOnly(row)
    },
  )

  test.each(ROUTE_OPTIONS)(
    "the client build of a route's `$key` option holds none of it, without an error",
    async (option) => {
      expectServerOnly(
        await builtRow(rows.findIndex((r) => r.input === option)),
      )
    },
  )
})
