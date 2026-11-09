/**
 * Start's own builder chains are no effect in the client build when their
 * arguments are pure (the arguments the client compile erases, a server
 * fn's handler and validator or a middleware's server, do not count): a
 * page-only `createServerFn()…handler(…)`, `createMiddleware(…).client(…)`
 * or `createIsomorphicFn()…` loads with the split chunk although an inline
 * `validateSearch` call after it stays in the route module. Learned from
 * real apps: 94 of 188 kept-declaration warnings over 10,653 route files
 * (47 apps) were such chains. A builder exists once: one read by two split
 * options lives in one module both import. A link called on a `const`
 * holding a builder stays an effect (a middleware's links write the
 * options of the builder they are called on), as does a chain with an
 * impure argument.
 *
 * Two exported server fns the component reads: each extracted module
 * imports the client stub's runtime itself, as it would an import the
 * source wrote (an extracted module evaluates before the route module's
 * body, so it reads nothing of the route module then). Learned from the
 * server-functions e2e app (its `method-not-allowed/$method` route), whose
 * client build failed the compiler's self-checks.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

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
  .server(() => 'server')
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
      // the client build's: the server compile's purity takes no builder
      // chain (an isomorphic fn the component reads still stays there)
      const reported = build.client.warnings
      const warnings = (path: string) =>
        findDiagnostics(reported, {
          file: `src/routes/${path}.tsx`,
          root: build.root,
        })
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

describe.each(startBundlers)(
  'a %s client build of exported chains',
  (bundler) => {
    test(
      'loads two exported server fns the component reads, each importing the client stub itself',
      async () => {
        const build = await buildStart({
          bundler,
          files: {
            'src/router.tsx': files['src/router.tsx'],
            'entry.ts': files['entry.ts'],
            'src/routes/two-exported.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
export const Route = createFileRoute('/two-exported')({
  component: Page,
})
export const first = createServerFn().handler(() => 'MARK_first')
export const second = createServerFn({ method: 'POST' }).handler(() => 'MARK_second')
function Page() {
  return <p data-first={first.url} data-second={second.url}>MARK_page</p>
}
`,
          },
        })
        expect(build.client.where('MARK_page')).toBe('lazy')
        expect(
          findDiagnostics(build.client.warnings, {
            file: 'src/routes/two-exported.tsx',
            root: build.root,
          }),
        ).toEqual([])
      },
      timeout,
    )
  },
)
