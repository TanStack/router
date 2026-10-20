/**
 * Server code written in shapes the Start compiler may not recognise, in
 * real builds through Start's Vite and Rsbuild plugins (build-harness.ts):
 * a builder method called through a computed member, a server-only fn whose
 * result is bound, a server fn declared in a top-level block, builders
 * imported under string export names. SPEC J4.5 ("unrecognised shapes must
 * not silently leak"), J4.6 ("block … work or error clearly"), J4.12; user
 * ruling 2026-10-20 restoring corpus inputs U078-U082 and U086 (with
 * U047/U048, the string export names).
 *
 * Either outcome passes, shape by shape: the shape works (the client bundle
 * holds none of its server-only module, the client's function does what the
 * client side does, a server fn's client calls the server, and the SSR
 * build runs the server code, by id through Start's server entry for a
 * server fn), or the build fails with an error that names the shape's file
 * and the line of the call (`expectSourceError`). A silent leak, a broken
 * function or an unclear build error fails.
 *
 * The compile-level twins: ../known-bugs-start-compiler.test.ts ("the
 * client holds no server code, or the module is rejected at the call", and
 * the placement "a block at the module top level"),
 * ../start-compiler-factories.test.ts (string export names).
 *
 * The shapes share one build per bundler. When that build (or a run of it)
 * fails, each shape is built on its own, so the rejection of one shape never
 * decides the outcome of another.
 */
import { afterAll, describe, expect, test } from 'vitest'
import { identifiesEnvRestriction } from '@tanstack/compiler-test-utils/diagnostics'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import { expectSourceError } from '../regression-helpers'
import type { StartBuild, StartBundler } from '../build-harness'

const timeout = 60_000

/** What the client and SSR runs of a shape gave. */
interface Observed {
  /** Where the shape's server-only module is in the client bundle. */
  where: string
  client: unknown
  ssr: unknown
}

interface Shape {
  name: string
  /** Its module is `src/<slug>.ts`, exported as `entry.<slug>`. */
  slug: string
  /** The module's source (`src/<slug>.ts`). */
  source: (db: string) => string
  /** The text of the call a build error points at, in `source`. */
  at: string
  /** What a build error names (a list: any one of its alternatives). */
  names: Array<string | Array<string>>
  /** Other modules of the shape, by path relative to the app root. */
  files?: Record<string, string>
  /** Other places a build error may point at. */
  sites?: Array<{ file: string; source: string; at: string }>
  /** Client script body: `shape` is the module's exports. */
  client: string
  /** SSR script body: `shape` is the module's exports, `client` what the client run gave. */
  ssr: string
  /** Checks a working shape's runs. */
  expectWorks: (observed: Observed, result: string) => void
}

/**
 * A server-only module (`src/<slug>-db.ts`): its top-level code sets the
 * shape's marker, which is also in its code, so the marker is in the client
 * bundle as soon as the module is; its functions return `result` (and record
 * the call).
 */
const dbModule = (
  marker: string,
  result: string,
) => `;(globalThis as Record<string, unknown>).${marker} = 'loaded'
export const db = {
  x: () => {
    ;(globalThis as Record<string, unknown>).${marker}_CALLED = true
    return '${result}'
  },
}
`

/**
 * Client script of a server fn `fn`: its id and the requests calling it
 * sends (none reach a server in a client run).
 */
const clientServerFn = (fn: string) => `const fn = ${fn}
return { id: fn?.serverFnMeta?.id ?? null, url: fn?.url ?? null, requests: await requestsOf(fn) }`

/** SSR script of a server fn `fn`: called in place and by the client's id. */
const ssrServerFn = (fn: string) => `return {
  called: await ${fn}(),
  byId: client && client.id ? await callById(client.id) : null,
}`

/** A working server fn: the client calls the server, the SSR build runs it. */
function expectServerFnWorks(client: unknown, ssr: unknown, result: string) {
  const { id, url, requests } = client as {
    id: unknown
    url: unknown
    requests: unknown
  }
  expect(id, 'client server fn id').toEqual(expect.any(String))
  expect(url, 'client server fn url').toMatch(/^\/_serverFn\/./)
  expect(requests, 'requests of a client call').toEqual([
    { url, method: 'GET' },
  ])
  expect(ssr).toEqual({ called: result, byId: result })
}

/** The re-exports of the string export names shape. */
const stringNamesStart = `export { createServerFn as 'create server fn', createServerOnlyFn as 'server only' } from '@tanstack/react-start'
`
const stringNamesSource = (
  db: string,
) => `import { 'create server fn' as createServerFn, 'server only' as createServerOnlyFn } from './stringNames-start'
import { db } from './${db}'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server-only')
`

const shapes: Array<Shape> = [
  {
    name: 'a server fn handler called through a computed member',
    slug: 'computedHandler',
    source: (db) => `import { createServerFn } from '@tanstack/react-start'
import { db } from './${db}'
export const fn = createServerFn()['handler'](async () => db.x())
`,
    at: `createServerFn()['handler']`,
    names: [['createServerFn', 'handler']],
    client: clientServerFn('shape.fn'),
    ssr: ssrServerFn('shape.fn'),
    expectWorks: ({ client, ssr }, result) =>
      expectServerFnWorks(client, ssr, result),
  },
  {
    name: 'a request middleware server implementation called through a computed member',
    slug: 'computedMiddleware',
    source: (db) => `import { createMiddleware } from '@tanstack/react-start'
import { db } from './${db}'
export const mw = createMiddleware()['server'](async ({ next }) => {
  db.x()
  return next()
})
`,
    at: `createMiddleware()['server']`,
    names: [['createMiddleware', 'server']],
    client: `return typeof shape.mw`,
    ssr: `return {
  next: await shape.mw.options.server({ next: () => 'next' }),
  called: globalThis.MARK_COMPUTEDMIDDLEWARE_DB_CALLED ?? false,
}`,
    expectWorks: ({ client, ssr }) => {
      expect(client).toBe('object')
      expect(ssr).toEqual({ next: 'next', called: true })
    },
  },
  {
    name: 'an isomorphic server implementation called through a computed member',
    slug: 'computedIsomorphic',
    source: (db) => `import { createIsomorphicFn } from '@tanstack/react-start'
import { db } from './${db}'
export const fn = createIsomorphicFn()['server'](() => db.x()).client(() => 'client')
`,
    at: `createIsomorphicFn()['server']`,
    names: [['createIsomorphicFn', 'server']],
    client: `return shape.fn()`,
    ssr: `return shape.fn()`,
    expectWorks: ({ client, ssr }, result) => {
      expect({ client, ssr }).toEqual({ client: 'client', ssr: result })
    },
  },
  {
    name: 'a createServerOnlyFn whose result is bound',
    slug: 'boundServerOnly',
    source: (db) => `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './${db}'
export const read = createServerOnlyFn(() => db.x()).bind(null)
`,
    at: 'createServerOnlyFn(',
    names: [['createServerOnlyFn', 'bind']],
    client: `return { value: shape.read() }`,
    ssr: `return shape.read()`,
    expectWorks: ({ client, ssr }, result) => {
      expect(
        identifiesEnvRestriction(
          (client as { thrown?: unknown }).thrown,
          'server',
        ),
        JSON.stringify(client),
      ).toBe(true)
      expect(ssr).toBe(result)
    },
  },
  {
    name: 'a server fn declared in a top-level block',
    slug: 'topLevelBlock',
    source: (db) => `import { createServerFn } from '@tanstack/react-start'
import { db } from './${db}'
export const registry: Array<unknown> = []
{
  const inner = createServerFn().handler(async () => db.x())
  registry.push(inner)
}
`,
    at: 'createServerFn()',
    names: ['createServerFn'],
    client: clientServerFn('shape.registry[0]'),
    ssr: ssrServerFn('shape.registry[0]'),
    expectWorks: ({ client, ssr }, result) =>
      expectServerFnWorks(client, ssr, result),
  },
  {
    name: 'builders imported under string export names',
    slug: 'stringNames',
    source: stringNamesSource,
    at: 'createServerFn()',
    names: ['createServerFn'],
    files: { 'src/stringNames-start.ts': stringNamesStart },
    sites: [
      {
        file: 'src/stringNames.ts',
        source: stringNamesSource('stringNames-db'),
        at: "'create server fn' as",
      },
      {
        file: 'src/stringNames-start.ts',
        source: stringNamesStart,
        at: "'create server fn'",
      },
    ],
    client: `${clientServerFn('shape.fn').replace(
      /^return \{/m,
      `let serverOnly
try {
  serverOnly = { value: shape.serverOnly() }
} catch (error) {
  serverOnly = { thrown: { name: error.name, message: error.message } }
}
return { serverOnly,`,
    )}`,
    ssr: ssrServerFn('shape.fn').replace(
      /^return \{/,
      `return {
  serverOnly: shape.serverOnly(),`,
    ),
    expectWorks: ({ client, ssr }, result) => {
      const { serverOnly, ...fn } = client as {
        serverOnly: { thrown?: unknown }
      }
      expect(
        identifiesEnvRestriction(serverOnly.thrown, 'server'),
        JSON.stringify(serverOnly),
      ).toBe(true)
      const { serverOnly: ssrServerOnly, ...ssrFn } = ssr as {
        serverOnly: unknown
      }
      expect(ssrServerOnly).toBe('server-only')
      expectServerFnWorks(fn, ssrFn, result)
    },
  },
]

const marker = (shape: Shape) => `MARK_${shape.slug.toUpperCase()}_DB`
const result = (shape: Shape) => `MARK_${shape.slug.toUpperCase()}_RESULT`

/** The app files of `list`, each shape exported from the entry. */
function appFiles(list: Array<Shape>) {
  const files: Record<string, string> = {}
  for (const shape of list) {
    files[`src/${shape.slug}.ts`] = shape.source(`${shape.slug}-db`)
    files[`src/${shape.slug}-db.ts`] = dbModule(marker(shape), result(shape))
    Object.assign(files, shape.files)
  }
  files['src/entry.ts'] = list
    .map((shape) => `export * as ${shape.slug} from './${shape.slug}'\n`)
    .join('')
  files['src/ssr-entry.ts'] = `export * from './entry'\n${callByIdExports}`
  return files
}

/** Runs each shape's script in one run, each in its own `try`. */
const script = (list: Array<Shape>, part: 'client' | 'ssr') =>
  `const results = {}
${list
  .map(
    (shape) => `results[${JSON.stringify(shape.slug)}] = await (async () => {
  const shape = entry.${shape.slug}
  const client = clientResults[${JSON.stringify(shape.slug)}]
  try {
    ${shape[part]}
  } catch (error) {
    return { thrown: { name: error?.name, message: String(error?.message ?? error) } }
  }
})()`,
  )
  .join('\n')}
return results`

/** Builds `list` in one app and observes each shape. */
async function observe(
  bundler: StartBundler,
  list: Array<Shape>,
  registerCleanup?: (cleanup: () => Promise<void>) => void,
): Promise<Record<string, Observed>> {
  const build: StartBuild = await buildStart({
    bundler,
    files: appFiles(list),
    entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
    registerCleanup,
  })
  const client = (
    await build.client.run(
      `${requestsOfPrelude}const clientResults = {}\n${script(list, 'client')}`,
    )
  ).result as Record<string, unknown>
  const ssr = (
    await build.ssr.run(
      `${callByIdPrelude}const clientResults = ${JSON.stringify(client)}\n${script(list, 'ssr')}`,
    )
  ).result as Record<string, unknown>
  return Object.fromEntries(
    list.map((shape) => [
      shape.slug,
      {
        where: build.client.where(marker(shape)),
        client: client[shape.slug],
        ssr: ssr[shape.slug],
      },
    ]),
  )
}

describe.each(startBundlers)('%s build', (bundler) => {
  const cleanups: Array<() => Promise<void>> = []
  let shared: Promise<Record<string, Observed> | undefined> | undefined

  /** What building `shape` gave: its observation, or the build's error. */
  async function outcomeOf(
    shape: Shape,
  ): Promise<{ observed: Observed } | { error: unknown }> {
    shared ??= observe(bundler, shapes, (cleanup) =>
      cleanups.push(cleanup),
    ).catch(() => undefined)
    const together = await shared
    if (together) {
      return { observed: together[shape.slug]! }
    }
    return observe(bundler, [shape]).then(
      (alone) => ({ observed: alone[shape.slug]! }),
      (error: unknown) => ({ error }),
    )
  }

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  async function expectWorksOrRejected(shape: Shape) {
    const outcome = await outcomeOf(shape)
    if ('error' in outcome) {
      const source = shape.source(`${shape.slug}-db`)
      expectSourceError(outcome.error, {
        names: shape.names,
        sites: [
          { file: `src/${shape.slug}.ts`, source, at: shape.at },
          ...(shape.sites ?? []),
        ],
      })
      return
    }
    expect(
      outcome.observed.where,
      'the server-only module in the client bundle',
    ).toBe('nowhere')
    shape.expectWorks(outcome.observed, result(shape))
  }

  // Bug: chain methods called through a computed member
  // (`builder['handler'](...)`, `['server'](...)`), a server-only fn whose
  // result is member-called (`.bind(null)`), and a server fn in a top-level
  // block (with createServerFn the only factory imported) are left
  // untransformed by the client compiler (in-process pins in
  // ../known-bugs-start-compiler.test.ts), and the build succeeds.
  // Source: corpus inputs U078-U082/U086 (#8630 pins), user ruling
  // 2026-10-20; SPEC J4.5, J4.6, J4.12.
  // Impact: the server implementation and its server-only module ship in
  // the client bundle and run in the browser.
  test.fails.each(shapes.filter((shape) => shape.slug !== 'stringNames'))(
    '$name: the client bundle holds no server code and the shape works, or the build fails at the call',
    async (shape) => {
      await expectWorksOrRejected(shape)
    },
    timeout,
  )

  test.each(shapes.filter((shape) => shape.slug === 'stringNames'))(
    '$name: the client bundle holds no server code and the shape works, or the build fails at the call',
    async (shape) => {
      await expectWorksOrRejected(shape)
    },
    timeout,
  )
})
