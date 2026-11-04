/**
 * The input shapes of the Start compiler's dev-server rows, in production
 * builds through Start's Vite and Rsbuild plugins (../build-harness.ts):
 * factories and builders that other project modules define or re-export,
 * `export *` chains, packages re-exporting Start's factories, a factory of
 * a query-distinct virtual module, handlers written as function
 * expressions, identifiers and wrapper calls, builders called as factories,
 * and renamed and namespace imports of createServerFn (SPEC J4.5, G13). A
 * build resolves these through paths a dev server never takes (its own
 * resolution caches, and the server fn manifest Start's server entry looks
 * ids up in). The inputs are the dev rows' own (../compiler-inputs.ts).
 *
 * Every row has a directory of its own in one app per bundler. What is
 * observed is what a user sees: the build succeeds (its production client
 * output passes the dangling-name check), the client bundle holds none of a
 * row's server-only modules (SPEC J4.12), a server fn of the client calls
 * the server with its public URL (J4.1), the SSR build runs it in place
 * and by that URL's id through Start's server entry (J4.2, J4.3), and the
 * other exports do in each environment what the dev rows expect (J4.9,
 * J4.10).
 */
import { afterAll, describe, expect, test } from 'vitest'
import { workspacePackageLinks } from '@tanstack/compiler-test-utils/workspace-packages'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  requestsOfPrelude,
  startBundlers,
} from '../build-harness'
import {
  aliasedClientOnlyFiles,
  compiledLibraries,
  cycleModule,
  deeperChainModule,
  exportStarModule,
  exportStarRows,
  factoryBuilderModule,
  factoryDb,
  factoryEdits,
  factoryRows,
  forms,
  handlerFiles,
  handlerModule,
  handlerRows,
  libraryChainRows,
  libraryPackages,
  moduleFiles,
  moduleImports,
  queryDistinctModule,
  reexportCycles,
  serverFnConstruct,
  virtualFactories,
} from '../compiler-inputs'
import { throwsError } from '../diagnostics'
import type { StartBuild, StartBundler } from '../build-harness'

const timeout = 60_000

interface Row {
  name: string
  /** The row's files, by path relative to its directory (`module.tsx` is its module). */
  files: Record<string, string>
  /** The module's server fns: export, and what its handler returns. */
  serverFns?: Record<string, unknown>
  /**
   * Expressions of the module's exports (`shape`), read in each environment:
   * what they give (`throwsError`: they throw). An environment left out is
   * not read.
   */
  reads?: Record<string, { client?: unknown; ssr?: unknown }>
  /** Text the bundle of each environment does not hold. */
  absent?: { client?: Array<string>; ssr?: Array<string> }
  /** Default: every bundler. */
  bundlers?: Array<StartBundler>
  /**
   * The module's exports the page reads, when it also exports a builder
   * (default: all of them): a module exporting a builder handed to page code
   * fails the client build.
   */
  exposed?: Array<string>
}

/** The library package names of the app (`libraryPackages`). */
const libraries = Object.fromEntries(
  compiledLibraries.map((name) => [name, '*']),
)

const rows: Array<Row> = [
  // start-compiler-factories.test.ts "factories resolved through project
  // modules" (one row per input)
  ...factoryRows
    .filter(
      (row, index) =>
        factoryRows.findIndex((other) => other.name === row.name) === index,
    )
    .map(
      (row): Row => ({
        name: row.name,
        files: { ...row.files, ...factoryDb, 'module.tsx': row.code },
        serverFns: row.serverFns > 0 ? { fn: 'x' } : {},
        reads: row.code.includes('export const iso')
          ? { 'shape.iso()': { client: 'client', ssr: 'w' } }
          : {},
      }),
    ),
  {
    name: 'an aliased re-export of createClientOnlyFn next to createServerOnlyFn',
    files: aliasedClientOnlyFiles,
    reads: {
      'shape.serverValue()': { ssr: 'secret' },
      'shape.clientValue()': { ssr: throwsError },
    },
  },
  // start-compiler-factories.test.ts "an export * chain with $name"
  ...exportStarRows.map(
    (row): Row => ({
      name: `an export * chain with ${row.name}`,
      files: { ...row.files, ...factoryDb, 'module.tsx': exportStarModule },
      serverFns: { fn: 'x' },
      reads: {
        'shape.serverOnly()': {
          client: row.resolvesServerOnlyFn ? throwsError : 'server-only-marker',
        },
      },
    }),
  ),
  // compiler.test.ts "re-export chain resolution"
  {
    name: 'a package re-exporting the factories of @tanstack/start-client-core',
    files: {
      'module.tsx': `export { getThemeData, initClientFeature } from '@third-party/lib'\n`,
    },
    reads: Object.fromEntries(
      ['createIsomorphicFn', 'createClientOnlyFn'].map((fn) => [
        fn === 'createIsomorphicFn'
          ? 'shape.getThemeData()'
          : 'shape.initClientFeature()',
        Object.fromEntries(
          libraryChainRows
            .filter((row) => row.fn === fn)
            .map((row) => [row.env === 'client' ? 'client' : 'ssr', row.value]),
        ),
      ]),
    ),
    absent: {
      client: libraryChainRows
        .filter((row) => row.env === 'client' && row.absent)
        .map((row) => row.absent!),
      ssr: libraryChainRows
        .filter((row) => row.env === 'server' && row.absent)
        .map((row) => row.absent!),
    },
  },
  {
    name: 'a deeper re-export chain through another package',
    files: { 'module.tsx': deeperChainModule },
    reads: { 'shape.deepFn()': { client: 'deep-client' } },
    absent: { client: ['deep-server'] },
  },
  // createServerFn/createServerFn.test.ts
  {
    name: 'a factory a query-distinct virtual module re-exports',
    files: { 'module.tsx': queryDistinctModule },
    serverFns: { issueServerFn: 'issue-handler' },
    absent: { client: ['issue-handler'] },
    // (a Vite plugin serves the virtual modules)
    bundlers: ['vite'],
  },
  {
    name: 'server fn builders with middleware called as factories',
    files: { 'module.tsx': factoryBuilderModule },
    exposed: ['myAuthedFn', 'deleteUserFn', 'x'],
    serverFns: {
      myAuthedFn: ['myAuthedFn', { auth: 'auth' }],
      deleteUserFn: ['deleteUserFn', { auth: 'auth', admin: 'admin' }],
    },
    reads: { 'shape.x': { client: 'fakeFn' } },
    absent: {
      client: ['MARK_AUTHED_HANDLER_BODY', 'MARK_DELETE_HANDLER_BODY'],
    },
  },
  // createServerFn/handler-scope.test.ts "the handler can be $name"
  ...handlerRows
    .filter((row) =>
      [
        'a named function expression',
        'a wrapper call',
        'a function declared after the server fn',
        'an imported function',
      ].includes(row.name),
    )
    .map(
      (row): Row => ({
        name: `a handler that is ${row.name}`,
        files: { ...handlerFiles, 'module.tsx': handlerModule(row.code) },
        serverFns: { fn: row.expected },
      }),
    ),
  // integration/pages/start-compiler-import-forms.test.ts "createServerFn"
  ...Object.entries(forms).map(
    ([formName, form]): Row => ({
      name: `createServerFn through ${formName}`,
      files: {
        ...moduleFiles,
        'module.tsx': `${form.imports('@tanstack/react-start', 'createServerFn')}
${moduleImports}
${serverFnConstruct(form.callee('createServerFn'), form.wrap)}`,
      },
      serverFns: { fn: 'x' },
      reads: { 'shape.fn.method': { client: 'POST', ssr: 'POST' } },
    }),
  ),
]

const slug = (row: Row) => `r${rows.indexOf(row)}`

/** The marker of the row's server-only modules (`*.server.*`). */
const serverMarker = (row: Row) => `MARK_SERVER_ONLY_${slug(row).toUpperCase()}`

/**
 * The app files of `list`: each row's files in its directory, its
 * server-only modules setting its marker (so the marker is in a bundle as
 * soon as the module is), and the entries re-exporting each row's module.
 */
function appFiles(list: Array<Row>) {
  const files: Record<string, string> = { ...libraryPackages }
  for (const row of list) {
    for (const [file, code] of Object.entries(row.files)) {
      files[`src/rows/${slug(row)}/${file}`] = /\.server\.[cm]?[jt]sx?$/.test(
        file,
      )
        ? `${code}\n;(globalThis as Record<string, unknown>).${serverMarker(row)} = true\n`
        : code
    }
  }
  for (const row of list) {
    if (row.exposed) {
      files[`src/rows/${slug(row)}/exposed.ts`] =
        `export { ${row.exposed.join(', ')} } from './module'\n`
    }
  }
  files['src/entry.ts'] = list
    .map(
      (row) =>
        `export * as ${slug(row)} from './rows/${slug(row)}/${row.exposed ? 'exposed' : 'module'}'\n`,
    )
    .join('')
  files['src/ssr-entry.ts'] = `export * from './entry'\n${callByIdExports}`
  return files
}

/** What reading `expression` gives in a script: `{ value }` or `{ thrown }`. */
const settlePrelude = `const settle = async (read) => {
  try {
    return { value: await read() }
  } catch (error) {
    return { thrown: String(error?.message ?? error) }
  }
}
`

/** The client script of `list`: each server fn's URL and requests, each read. */
const clientScript = (list: Array<Row>) => `${requestsOfPrelude}${settlePrelude}
const results = {}
${list
  .map(
    (row) => `results.${slug(row)} = await (async () => {
  const shape = entry.${slug(row)}
  const fns = {}
  for (const name of ${JSON.stringify(Object.keys(row.serverFns ?? {}))}) {
    const fn = shape[name]
    fns[name] = {
      url: typeof fn?.url === 'string' ? fn.url : null,
      method: fn?.method,
      requests: typeof fn === 'function' ? (await requestsOf(fn)).map((request) => request.url) : null,
    }
  }
  return {
    fns,
    reads: {
${Object.entries(row.reads ?? {})
  .filter(([, read]) => 'client' in read)
  .map(
    ([expression]) =>
      `      ${JSON.stringify(expression)}: await settle(() => ${expression}),`,
  )
  .join('\n')}
    },
  }
})()`,
  )
  .join('\n')}
return results`

/**
 * The SSR script of `list`: each server fn called in place and by the id of
 * the client's URL, each read.
 */
const ssrScript = (
  list: Array<Row>,
  client: Record<string, unknown>,
) => `${callByIdPrelude}${settlePrelude}
const clientResults = ${JSON.stringify(client)}
const results = {}
${list
  .map(
    (row) => `results.${slug(row)} = await (async () => {
  const shape = entry.${slug(row)}
  const fns = {}
  for (const name of ${JSON.stringify(Object.keys(row.serverFns ?? {}))}) {
    const { url, method } = clientResults.${slug(row)}?.fns?.[name] ?? {}
    fns[name] = {
      called: await settle(() => shape[name]()),
      byId: url ? await settle(() => callById(serverFnId(url), undefined, method)) : null,
    }
  }
  return {
    fns,
    reads: {
${Object.entries(row.reads ?? {})
  .filter(([, read]) => 'ssr' in read)
  .map(
    ([expression]) =>
      `      ${JSON.stringify(expression)}: await settle(() => ${expression}),`,
  )
  .join('\n')}
    },
  }
})()`,
  )
  .join('\n')}
return results`

interface Observed {
  fns: Record<string, any>
  reads: Record<string, unknown>
}

/** What a read gives when it is expected to give `expected`. */
const settled = (expected: unknown) =>
  expected === throwsError
    ? { thrown: expect.any(String) }
    : { value: expected }

/** A built app of rows, and what each row's client and SSR runs gave. */
interface BuiltRows {
  build: StartBuild
  client: Record<string, Observed>
  ssr: Record<string, Observed>
}

/** Builds an app of `list` with `bundler` and runs every row once. */
async function buildRows(
  bundler: StartBundler,
  list: Array<Row>,
  registerCleanup?: (cleanup: () => Promise<void>) => void,
): Promise<BuiltRows> {
  const build = await buildStart({
    bundler,
    files: appFiles(list),
    entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
    // Unminified: a minifier renames functions, and a row reads one's name
    minify: false,
    // A leak shows in the bundle (import protection would fail the build
    // on it)
    start: { importProtection: { enabled: false } },
    // The app depends on the packages of `libraryPackages`, whose Start
    // peer resolves like a dependency installed for them
    packageJson: {
      name: 'app',
      private: true,
      type: 'module',
      dependencies: libraries,
    },
    symlinks: workspacePackageLinks(['@tanstack/start-client-core']),
    viteConfig: { plugins: [virtualFactories()] },
    registerCleanup,
  })
  const client = (await build.client.run(clientScript(list))).result as Record<
    string,
    Observed
  >
  const ssr = (await build.ssr.run(ssrScript(list, client))).result as Record<
    string,
    Observed
  >
  return { build, client, ssr }
}

/** The row works in the build, as the module comment says. */
function expectRowWorks(row: Row, { build, client, ssr }: BuiltRows) {
  const name = slug(row)
  if (Object.keys(row.files).some((file) => /\.server\./.test(file))) {
    expect(
      build.client.where(serverMarker(row)),
      'the server-only modules in the client bundle',
    ).toBe('nowhere')
  }
  for (const environment of ['client', 'ssr'] as const) {
    for (const text of row.absent?.[environment] ?? []) {
      expect(build[environment].where(text), `${environment}: ${text}`).toBe(
        'nowhere',
      )
    }
  }
  for (const [fn, result] of Object.entries(row.serverFns ?? {})) {
    const { url, requests } = client[name]!.fns[fn]
    expect(url, `${fn}: the client's URL`).toMatch(/^\/_serverFn\/./)
    expect(requests, `${fn}: the requests of a client call`).toEqual([url])
    expect(ssr[name]!.fns[fn], `${fn} on the server`).toEqual({
      called: { value: result },
      byId: { value: result },
    })
  }
  for (const [expression, expected] of Object.entries(row.reads ?? {})) {
    for (const environment of ['client', 'ssr'] as const) {
      if (environment in expected) {
        const observed = environment === 'client' ? client : ssr
        expect(
          observed[name]!.reads[expression],
          `${environment}: ${expression}`,
        ).toEqual(settled(expected[environment]))
      }
    }
  }
}

describe.each(startBundlers)('%s build', (bundler) => {
  const list = rows.filter((row) =>
    (row.bundlers ?? startBundlers).includes(bundler),
  )
  const cleanups: Array<() => Promise<void>> = []
  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  let built: Promise<BuiltRows> | undefined
  /** The app of every row, built and run once. */
  const shared = () =>
    (built ??= buildRows(bundler, list, (cleanup) => cleanups.push(cleanup)))

  test.each(list)(
    '$name',
    async (row) => {
      expectRowWorks(row, await shared())
    },
    timeout,
  )

  // compiler.test.ts "handles circular import chain: $name": the cycles
  // never reach a Start factory, and the build ends, built or failed,
  // instead of looping (the test's timeout bounds it).
  test(
    'a build of modules importing a factory through re-export cycles ends',
    async () => {
      const files: Record<string, string> = {}
      reexportCycles.forEach((cycle, index) => {
        for (const [file, code] of Object.entries({
          ...cycle.files,
          'module.tsx': cycleModule,
        })) {
          files[`src/cycles/c${index}/${file}`] = code
        }
      })
      files['src/entry.ts'] = reexportCycles
        .map(
          (_, index) =>
            `export * as c${index} from './cycles/c${index}/module'\n`,
        )
        .join('')
      const ended = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { enabled: false } },
      }).then(
        () => 'built',
        () => 'failed',
      )
      expect(['built', 'failed']).toContain(ended)
    },
    timeout,
  )
})

// The dev edits of known-bugs-start-compiler.test.ts ("dev edits"), in
// `rsbuild build --watch` (SPEC J4.5, G13): the first build fills the
// build's resolution caches, then one module a factory comes from is
// edited, which the module using the factory does not import directly.
// The rebuild runs the edited code.
describe('rsbuild build --watch', () => {
  const dirs = {
    reexportChain: 'src/edits/chain',
    aliasedEnvOnly: 'src/edits/aliased',
  }
  const inDir = (dir: string, files: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(files).map(([file, code]) => [`${dir}/${file}`, code]),
    )
  const cleanups: Array<() => Promise<void>> = []
  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  let rebuilt: Promise<StartBuild> | undefined
  /** The rebuild both edits cause (one watch build). */
  const rebuild = () =>
    (rebuilt ??= buildStart({
      bundler: 'rsbuild',
      files: {
        ...inDir(dirs.reexportChain, factoryEdits.reexportChain.files),
        ...inDir(dirs.aliasedEnvOnly, factoryEdits.aliasedEnvOnly.files),
        'src/entry.ts': `export * as chain from './edits/chain/module'
export * as aliased from './edits/aliased/module'
`,
        'src/ssr-entry.ts': `export * from './entry'\n${callByIdExports}`,
      },
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      start: { importProtection: { enabled: false } },
      watchEdits: {
        ...inDir(dirs.reexportChain, factoryEdits.reexportChain.edit),
        ...inDir(dirs.aliasedEnvOnly, factoryEdits.aliasedEnvOnly.edit),
      },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    }))

  // (The dev server's twin is pinned: known-bugs-start-compiler.test.ts
  // "a dev edit of a module a re-export chain ends in recompiles its
  // importers".)
  test(
    'an edit of the module a re-export chain ends in recompiles its importers',
    async () => {
      const { client, ssr } = await rebuild()
      const call = `try {
  return { value: entry.chain.myFn() }
} catch (error) {
  return { thrown: String(error?.message ?? error) }
}`
      expect({
        client: (await client.run(call)).result,
        ssr: (await ssr.run(call)).result,
      }).toEqual({
        client: { value: 'server-only-value' },
        ssr: { thrown: expect.any(String) },
      })
    },
    timeout,
  )

  test(
    'an edit of an aliased env-only factory recompiles the server fn that calls it',
    async () => {
      const { client, ssr } = await rebuild()
      const { url } = (
        await client.run(`return { url: entry.aliased.serverFn.url }`)
      ).result as { url: string }
      expect(
        (
          await ssr.run(`${callByIdPrelude}${settlePrelude}
return {
  called: await settle(() => entry.aliased.serverFn()),
  byId: await settle(() => callById(serverFnId(${JSON.stringify(url)}))),
}`)
        ).result,
      ).toEqual({
        called: { thrown: expect.any(String) },
        byId: { thrown: expect.any(String) },
      })
    },
    timeout,
  )
})
