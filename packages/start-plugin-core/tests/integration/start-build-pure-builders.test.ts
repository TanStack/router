/**
 * Start's own builder chains are no effect in the client and the server
 * builds when their arguments are pure (the arguments an environment's
 * compile erases, on the client a server fn's handler and validator or a
 * middleware's server, do not count): a page-only
 * `createServerFn()…handler(…)`, `createMiddleware(…).client(…)` or
 * `createIsomorphicFn()…` loads with the split chunk although an inline
 * `validateSearch` call after it stays in the route module. Learned from
 * real apps: 94 of 188 kept-declaration warnings over 10,653 route files
 * (47 apps) were such chains. A builder exists once: one read by two split
 * options lives in one module both import, and a middleware a server fn and
 * split code read runs once per call. A link called on a `const` holding a
 * builder stays an effect (a middleware's links write the options of the
 * builder they are called on), as does a chain with an impure argument.
 * Both environments agree, so a server fn nested in a function may take a
 * builder chain in its options (the server compile hoists it).
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../build-harness'

const timeout = 120_000

/** A client middleware sending `tag` (a marker the client output keeps). */
const tagging = (tag: string) =>
  `createMiddleware({ type: 'function' }).client(({ next }) => next({ sendContext: { tag: '${tag}' } }))`

/** A route declaring `declaration` (read by `component`), then a `validateSearch` call that stays and runs after it. */
const route = (
  path: string,
  declaration: string,
  component: string,
  imports = '',
) => `import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn, createMiddleware, createServerFn } from '@tanstack/react-start'
import { makeSchema } from '../schema'
${imports}
${declaration}
export const Route = createFileRoute('/${path}')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => ${component},
})
`

const files = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export const getRouter = () => createRouter({ routeTree })
`,
  'entry.ts': 'export const ok = true\n',
  'src/schema.ts': 'export function makeSchema<T>(shape: T) { return shape }\n',
  'src/middleware.ts': `import { createMiddleware } from '@tanstack/react-start'
export function makeMiddleware(tag: string) {
  return ${tagging("' + tag + '")}
}
`,
  'src/routes/server-fn.tsx': route(
    'server-fn',
    `const getLabel = createServerFn()
  .middleware([${tagging('MARK_server-fn')}])
  .handler(async () => 'label')`,
    '<button onClick={() => getLabel()}>go</button>',
  ),
  'src/routes/exported.tsx': route(
    'exported',
    `export const getExported = createServerFn({ method: 'POST' })
  .middleware([${tagging('MARK_exported')}])
  .validator((input: string) => input)
  .handler(async ({ data }) => data)`,
    "<button onClick={() => getExported({ data: 'x' })}>go</button>",
  ),
  'src/routes/middleware.tsx': route(
    'middleware',
    `const tagged = ${tagging('MARK_middleware')}
const run = createServerFn().middleware([tagged]).handler(async () => 1)`,
    '<button onClick={() => run()}>go</button>',
  ),
  'src/routes/isomorphic.tsx': route(
    'isomorphic',
    `const label = createIsomorphicFn()
  .server(() => 'SERVER_isomorphic')
  .client(() => 'MARK_isomorphic')`,
    '<p>{label()}</p>',
  ),
  // read by two split options: one module both chunks import
  'src/routes/shared.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { makeSchema } from '../schema'
const tagged = ${tagging('MARK_shared')}
const first = createServerFn().middleware([tagged]).handler(async () => 1)
const second = createServerFn().middleware([tagged]).handler(async () => 2)
export const Route = createFileRoute('/shared')({
  validateSearch: makeSchema({ tab: 'string' }),
  component: () => <button onClick={() => first()}>go</button>,
  errorComponent: () => <button onClick={() => second()}>retry</button>,
})
`,
  // a link on a `const` builder writes that builder's options: an effect
  'src/routes/const-receiver.tsx': route(
    'const-receiver',
    `const base = createMiddleware({ type: 'function' })
const linked = base.client(({ next }) => next({ sendContext: { tag: 'MARK_const-receiver' } }))
const run = createServerFn().middleware([linked]).handler(async () => 1)`,
    '<button onClick={() => run()}>go</button>',
  ),
  'src/routes/impure.tsx': route(
    'impure',
    `const run = createServerFn()
  .middleware([makeMiddleware('MARK_impure')])
  .handler(async () => 1)`,
    '<button onClick={() => run()}>go</button>',
    "import { makeMiddleware } from '../middleware'",
  ),
}

const pure = ['server-fn', 'exported', 'middleware', 'isomorphic', 'shared']

describe.each(startBundlers)('a %s client build', (bundler) => {
  test(
    "loads Start's builder chains with the chunk that reads them, one instance each",
    async () => {
      const build = await buildStart({ bundler, files })
      const reported = build.client.warnings
      const warnings = (path: string) =>
        findDiagnostics(reported, {
          file: `src/routes/${path}.tsx`,
          root: build.root,
        })
      // the server build agrees: nothing reported, the isomorphic fn's
      // server implementation loads with the SSR chunk of the component
      expect(
        Object.fromEntries(
          pure.map((path) => [
            path,
            findDiagnostics(build.ssr.warnings, {
              file: `src/routes/${path}.tsx`,
              root: build.root,
            }),
          ]),
        ),
      ).toEqual(Object.fromEntries(pure.map((path) => [path, []])))
      expect(build.ssr.where('SERVER_isomorphic')).toBe('lazy')
      // one module: Rolldown emits a module two chunks import as a chunk of
      // its own (Rspack copies a small one into both chunks under one module
      // id, which its runtime evaluates once)
      const holding = (marker: string) =>
        bundler === 'vite'
          ? build.client.chunks.filter((c) => c.code.includes(marker)).length
          : 1
      expect(
        Object.fromEntries(
          pure.map((path) => [
            path,
            {
              where: build.client.where(`MARK_${path}`),
              chunks: holding(`MARK_${path}`),
              warnings: warnings(path),
            },
          ]),
        ),
      ).toEqual(
        Object.fromEntries(
          pure.map((path) => [
            path,
            { where: 'lazy', chunks: 1, warnings: [] },
          ]),
        ),
      )
      for (const path of ['const-receiver', 'impure']) {
        expect(build.client.where(`MARK_${path}`), path).toBe('eager')
        expect(warnings(path).length, path).toBeGreaterThan(0)
      }
      expectDiagnostic(reported, {
        severity: 'warning',
        file: 'src/routes/impure.tsx',
        root: build.root,
        position: diagnosticPosition(files['src/routes/impure.tsx'], 'run ='),
        times: 1,
      })
    },
    timeout,
  )
})

/** A middleware sending `MARK_nested` to the handler, as an inline chain. */
const sending = `createMiddleware({ type: 'function' }).server(({ next }) => next({ context: { via: 'MARK_nested' } }))`

const serverFiles = {
  'src/schema.ts': files['src/schema.ts'],
  // a server fn nested in a function, with a builder chain in its options
  'src/nested.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
export function makeLookup() {
  return createServerFn()
    .middleware([${sending}])
    .handler(async ({ context }) => context.via)
}
`,
  // a middleware a server fn (called by the loader) and the split component
  // read; another middleware lists it too: one instance runs once per call
  'src/routes/identity.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware, createServerFn } from '@tanstack/react-start'
import { makeSchema } from '../schema'
const counted = createMiddleware({ type: 'function' }).server(({ next }) => {
  const runs = globalThis as { __runs?: number }
  runs.__runs = (runs.__runs ?? 0) + 1
  return next()
})
const wrapped = createMiddleware({ type: 'function' })
  .middleware([counted])
  .server(({ next }) => next())
const count = createServerFn()
  .middleware([counted, wrapped])
  .handler(async () => (globalThis as { __runs?: number }).__runs)
export const Route = createFileRoute('/identity')({
  validateSearch: makeSchema({ tab: 'string' }),
  loader: () => count(),
  component: () => <p>{'MARK_identity'}{typeof counted.options}</p>,
})
`,
  'client-entry.ts': `export { makeLookup } from './src/nested'
`,
  'ssr-entry.ts': `export { makeLookup } from './src/nested'
${callByIdExports}`,
}

describe.each(startBundlers)('a %s build', (bundler) => {
  test(
    'runs a nested server fn whose options are a builder chain, and a shared middleware once per call',
    async () => {
      const build = await buildStart({
        bundler,
        files: serverFiles,
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
      })
      const url = (await build.client.run('return entry.makeLookup().url'))
        .result
      const { result } = await build.ssr.run(`${callByIdPrelude}
const runs = () => globalThis.__runs ?? 0
const lookup = await callById(serverFnId(${JSON.stringify(url)}))
const before = runs()
const page = await entry.startServerEntry.fetch(new Request('http://localhost/identity'))
const html = await page.text()
return { lookup, runs: runs() - before, rendered: html.includes('MARK_identity') }`)
      expect(result).toEqual({
        lookup: 'MARK_nested',
        runs: 1,
        rendered: true,
      })
    },
    timeout,
  )
})
