/**
 * Inputs of Start compiler rows that run in both modes: on the dev server
 * (start-compiler-factories.test.ts, compiler.test.ts,
 * createServerFn/handler-scope.test.ts, createServerFn/createServerFn.test.ts,
 * integration/pages/start-compiler-import-forms.test.ts) and in production
 * builds (integration/start-compiler-build-inputs.test.ts). Each gives the
 * modules a user writes and what its rows expect; how each mode observes it
 * is the test file's.
 */
import { throwsError } from './diagnostics'
import type { Plugin } from 'vite'

/** The server-only module the factory rows read (`./db.server`). */
export const factoryDb = {
  'db.server.ts': `export const db = { x: () => 'x', y: () => 'y', w: () => 'w', log: () => {} }\n`,
}

/**
 * A factory or builder that a project module defines or re-exports, and a
 * module (`code`) that uses it: the client loads no server-only module
 * (`output: 'client'`), and the module gives its importers `serverFns`
 * server fns (`fn`, whose handler returns `'x'`); `iso`, where the module
 * has it, runs each environment's implementation (`'client'`, `'w'`).
 */
export interface FactoryRow {
  name: string
  output: 'client' | 'ssr'
  files: Record<string, string>
  code: string
  serverFns: number
}

export const factoryRows: Array<FactoryRow> = [
  {
    name: 'a default-exported middleware builder imported as default',
    output: 'client',
    files: {
      'mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export default createMiddleware({ type: 'function' })`,
    },
    // Known limitation on main: middleware is detected by the
    // `createMiddleware` text, so a module that only calls an imported
    // builder is not compiled and needs this import.
    code: `import { createMiddleware } from '@tanstack/react-start'
import mw from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => {
db.log()
return next()
})`,
    serverFns: 0,
  },
  {
    name: 'a default-exported server fn builder declared by identifier',
    output: 'client',
    files: {
      'builders.ts': `import { createServerFn } from '@tanstack/react-start'
const authed = createServerFn({ method: 'POST' })
export default authed`,
    },
    code: `import authed from './builders'
import { db } from './db.server'
export const fn = authed.handler(async () => db.x())`,
    serverFns: 1,
  },
  ...(['client', 'ssr'] as const).map((output) => ({
    name: 'a namespace import of a module re-exporting the factories',
    output,
    files: {
      'factories.ts': `export { createServerFn, createIsomorphicFn } from '@tanstack/react-start'`,
    },
    code: `import * as F from './factories'
import { db } from './db.server'
export const fn = F.createServerFn().handler(async () => db.x())
export const iso = F.createIsomorphicFn().server(() => db.w()).client(() => 'client')`,
    serverFns: 1,
  })),
  {
    name: 'a namespace import of a module re-exporting createMiddleware',
    output: 'client',
    files: {
      'middleware.ts': `export { createMiddleware } from '@tanstack/react-start'`,
    },
    code: `import * as M from './middleware'
import { db } from './db.server'
export const logged = M.createMiddleware({ type: 'function' }).server(async ({ next }) => {
db.log()
return next()
})`,
    serverFns: 0,
  },
  {
    name: 'renamed re-exports next to a type-only re-export',
    output: 'client',
    files: {
      'f.ts': `export { createServerFn as csf, createServerOnlyFn as so } from '@tanstack/react-start'
export type { Register } from '@tanstack/react-start'
export type * as types from '@tanstack/react-start'`,
    },
    code: `import { csf, so } from './f'
import type * as F from './f'
import { db } from './db.server'
export const fn = csf().handler(async () => db.x() as F.types.Register)
export const s = so(() => db.y())`,
    serverFns: 1,
  },
  {
    // Replaces createServerFn.test.ts "should use slow path for factory
    // pattern".
    name: 'a server fn factory const-aliased in another module',
    output: 'client',
    files: {
      'factory.ts': `import { createServerFn } from '@tanstack/react-start'
export const createFooServerFn = createServerFn`,
    },
    code: `import { createFooServerFn } from './factory'
import { db } from './db.server'
export const fn = createFooServerFn().handler(async () => db.x())`,
    serverFns: 1,
  },
]

/**
 * A module importing createServerFn and createServerOnlyFn through `./start`,
 * an `export *` chain (`exportStarRows`): its server fn `fn` returns `'x'`,
 * and `serverOnly` is the server-only fn of the package where the chain
 * resolves to it (`resolvesServerOnlyFn`), else the project's own plain
 * function.
 */
export const exportStarModule = `import { createServerFn, createServerOnlyFn } from './start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
export const serverOnly = createServerOnlyFn(() => 'server-only-marker')`

export interface ExportStarRow {
  name: string
  files: Record<string, string>
  resolvesServerOnlyFn: boolean
}

// Source: @vitejs/plugin-rsc expand-export-all fixtures (per row)
export const exportStarRows: Array<ExportStarRow> = [
  {
    // expand-export-all/explicit-wins
    name: 'a local export that overrides the star export',
    files: {
      'start.ts': `export * from '@tanstack/react-start'
export function createServerOnlyFn(fn) {
return fn
}`,
    },
    resolvesServerOnlyFn: false,
  },
  {
    // expand-export-all/nested-conflict-explicit-reexport-wins
    name: 'an explicit re-export that overrides a star export',
    files: {
      'start.ts': `export * from './custom'
export { createServerFn, createServerOnlyFn } from '@tanstack/react-start'`,
      'custom.ts': `export function createServerOnlyFn(fn) {
return fn
}`,
    },
    resolvesServerOnlyFn: true,
  },
  {
    // expand-export-all/bad-resolve. The star export names a module the
    // bundler's resolver gives no id for (Vite resolves no `data:` URL; the
    // browser and Node import it themselves), so a compiler following the
    // chain cannot read it and must go on with the other star export. A
    // star export to a missing file is not usable: it fails every real
    // build and every dev page.
    name: 'an unresolvable star export next to the package',
    files: {
      'start.ts': `export * from 'data:text/javascript,export const unrelated = 1'
export * from '@tanstack/react-start'`,
      'data-modules.d.ts': `declare module 'data:text/javascript,*' {
export const unrelated: number
}
`,
    },
    resolvesServerOnlyFn: true,
  },
  {
    // expand-export-all/duplicate-star-same-source
    name: 'the same module re-exported twice',
    files: {
      'start.ts': `export * from './inner'
export * from './inner'`,
      'inner.ts': `export * from '@tanstack/react-start'`,
    },
    resolvesServerOnlyFn: true,
  },
  {
    // expand-export-all/namespace-same-binding
    name: 'two star exports that each forward part of the package',
    files: {
      'start.ts': `export * from './a'
export * from './b'`,
      'a.ts': `export { createServerFn } from '@tanstack/react-start'`,
      'b.ts': `export { createServerOnlyFn } from '@tanstack/react-start'`,
    },
    resolvesServerOnlyFn: true,
  },
]

/**
 * Only createServerOnlyFn appears in the module's text; createClientOnlyFn
 * comes through an aliased re-export (`./env`). On the server, `serverValue`
 * returns `'secret'` and calling `clientValue` throws.
 */
export const aliasedClientOnlyFiles = {
  'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { clientOnly } from './env'
import { secret } from './secret.server'
import { readWindow } from './browser'
export const serverValue = createServerOnlyFn(() => secret())
export const clientValue = clientOnly(() => readWindow())`,
  'env.ts': `export { createClientOnlyFn as clientOnly } from '@tanstack/react-start'`,
  'secret.server.ts': `export const secret = () => 'secret'\n`,
  'browser.ts': `export const readWindow = () => 'window'\n`,
}

/**
 * Third-party packages of the app that import Start's factories from
 * `@tanstack/start-client-core` (TanStack/router#6583): real packages in the
 * app's `node_modules`, which the app compiles with its own code (a library
 * shipping Start factories is left out of dependency pre-bundling and SSR
 * externalization, as such an app configures it).
 */
export const libraryPackages = {
  'node_modules/@third-party/lib/package.json': JSON.stringify({
    name: '@third-party/lib',
    type: 'module',
    main: './index.js',
    peerDependencies: { '@tanstack/start-client-core': '*' },
  }),
  'node_modules/@third-party/lib/index.js': `import { createIsomorphicFn, createClientOnlyFn } from '@tanstack/start-client-core'

export const getThemeData = createIsomorphicFn()
  .client(() => 'client-theme')
  .server(() => 'server-theme')

export const initClientFeature = createClientOnlyFn(() => {
  console.log('client only initialization')
  return 'initialized'
})
`,
  'node_modules/@another-intermediate/pkg/package.json': JSON.stringify({
    name: '@another-intermediate/pkg',
    type: 'module',
    main: './index.js',
    peerDependencies: { '@tanstack/start-client-core': '*' },
  }),
  'node_modules/@another-intermediate/pkg/index.js': `export { createIsomorphicFn } from '@tanstack/start-client-core'\n`,
}
export const compiledLibraries = [
  '@third-party/lib',
  '@another-intermediate/pkg',
]

/**
 * What the exports of `@third-party/lib` give in each environment, through
 * its re-export chain to Start's package (`libraryPackages`).
 */
export const libraryChainRows: Array<{
  env: 'client' | 'server'
  fn: string
  /** What the export returns, or the error it throws. */
  value: unknown
  /** Implementation code the served library must not contain. */
  absent?: string
}> = [
  {
    env: 'client',
    fn: 'createIsomorphicFn',
    value: 'client-theme',
    absent: 'server-theme',
  },
  {
    env: 'server',
    fn: 'createIsomorphicFn',
    value: 'server-theme',
    absent: 'client-theme',
  },
  {
    env: 'client',
    fn: 'createClientOnlyFn',
    value: 'initialized',
  },
  {
    env: 'server',
    fn: 'createClientOnlyFn',
    value: throwsError,
    absent: 'client only initialization',
  },
]

/**
 * A module importing createIsomorphicFn through another intermediate package
 * (`@another-intermediate/pkg`): the client runs `'deep-client'`, and the
 * server implementation (`'deep-server'`) is not in the client.
 */
export const deeperChainModule = `import { createIsomorphicFn } from '@another-intermediate/pkg'
export const deepFn = createIsomorphicFn()
  .client(() => 'deep-client')
  .server(() => 'deep-server')`

/**
 * Re-export cycles a module imports createServerOnlyFn through
 * (`cycleModule`): they never reach a Start factory (they cannot even link
 * as ES modules), so compiling settles, with a result or an error, instead
 * of looping.
 */
export const cycleModule = `import { createServerOnlyFn } from './factory-a'
export const myFn = createServerOnlyFn(() => 'server-only-value')`

export const reexportCycles: Array<{
  name: string
  files: Record<string, string>
}> = [
  {
    name: 'named re-export cycle',
    files: {
      'factory-a.ts': `export { createServerOnlyFn } from './factory-b'\n`,
      'factory-b.ts': `export { createServerOnlyFn } from './factory-a'\n`,
    },
  },
  {
    name: 'import alias cycle',
    files: {
      'factory-a.ts': `import { createServerOnlyFn } from './factory-b'
export { createServerOnlyFn }
`,
      'factory-b.ts': `import { createServerOnlyFn } from './factory-a'
export { createServerOnlyFn }
`,
    },
  },
  {
    name: 'export-star cycle',
    files: {
      'factory-a.ts': `export * from './factory-b'\n`,
      'factory-b.ts': `export * from './factory-a'\n`,
    },
  },
]

/** The server-only modules the handler rows may read, as real files. */
export const handlerFiles = {
  'db.server.ts': `export const db = { x: () => 'x', y: () => 'y' }\n`,
  'auth.server.ts': `export const withAuth = (fn: (opts: unknown) => Promise<unknown>) => async (opts: unknown) => 'auth:' + (await fn(opts))\n`,
  'users.server.ts': `export const getUsers = async () => 'users'\n`,
}
export const handlerModules = ['./db.server', './auth.server', './users.server']

/**
 * The module of a handler row: `code` (which declares the server fn `fn`)
 * after its imports of createServerFn and, when it reads `db`, of
 * `./db.server`.
 */
export const handlerModule = (code: string) =>
  `import { createServerFn } from '@tanstack/react-start'\n${code.includes('db.') ? `import { db } from './db.server'\n` : ''}${code}`

/**
 * How a handler may be written: the server fn `fn` of `handlerModule(code)`
 * returns `expected` (an async iterable of its values with `iterate`),
 * whoever calls it.
 */
export interface HandlerRow {
  name: string
  code: string
  expected: unknown
  iterate?: boolean
}

export const handlerRows: Array<HandlerRow> = [
  {
    // Source: Next.js server-actions fixtures server-graph/7, /44
    name: 'a named function expression',
    code: `export const fn = createServerFn().handler(async function deleteItem() {
  return deleteItem.name + db.x()
})`,
    expected: 'deleteItemx',
  },
  {
    // Start calls the handler with one argument, its context (`this` is
    // runtime-defined: Start calls it as a method of its options).
    // Source: Next.js server-actions fixtures server-graph/59
    name: 'a function using arguments and new.target',
    code: `export const fn = createServerFn().handler(async function () {
  return [arguments.length, new.target === undefined, db.x()]
})`,
    expected: [1, true, 'x'],
  },
  {
    // Source: Next.js server-actions fixtures server-graph/14 (streaming)
    name: 'an async generator',
    code: `export const fn = createServerFn().handler(async function* () {
  yield db.x()
  yield 'done'
})`,
    iterate: true,
    expected: ['x', 'done'],
  },
  {
    // Source: Next.js server-actions fixtures server-graph/31
    name: 'an object literal method',
    code: `const handlers = {
  async f() {
    return db.x()
  },
}
export const fn = createServerFn().handler(handlers.f)`,
    expected: 'x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/21, /26
    name: 'a wrapper call',
    code: `import { withAuth } from './auth.server'
export const fn = createServerFn().handler(withAuth(async () => db.x()))`,
    expected: 'auth:x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/25
    name: 'a function declared after the server fn',
    code: `export const fn = createServerFn().handler(impl)
async function impl() {
  return inner()
  async function inner() {
    return db.x()
  }
}`,
    expected: 'x',
  },
  {
    // Source: Next.js server-actions fixtures server-graph/28, /30
    name: 'a call of a server fn declared later',
    code: `export const fn = createServerFn().handler(async () => (await later()) + db.x())
export const later = createServerFn().handler(async () => 'later:')`,
    expected: 'later:x',
  },
  {
    // Replaces createServerFn.test.ts "should remove imports used only as
    // caller handler identifiers".
    name: 'an imported function',
    code: `import { getUsers } from './users.server'
export const fn = createServerFn().handler(getUsers)`,
    expected: 'users',
  },
  {
    name: 'an initializer cast with as unknown as',
    code: `export const fn = createServerFn().handler(async () => db.x()) as unknown as () => Promise<string>`,
    expected: 'x',
  },
  {
    // Source: TanStack/router#3698
    name: 'a body calling other methods named handler',
    code: `const local = { handler: (value: string) => value + '!' }
export const fn = createServerFn().handler(async () =>
  local.handler([db].map((source) => ({ handler: source.y }))[0]!.handler() + db.x()),
)`,
    expected: 'yx!',
  },
]

/**
 * A user plugin serving two virtual modules that differ only by their
 * `variant` query: the public one re-exports the factory the
 * implementation one defines. It reads its own query parameter and ignores
 * any other (a plugin of query-bearing modules does).
 */
export function virtualFactories(): Plugin {
  const prefix = '\0virtual:server-fn-factory?'
  const modules: Record<string, string> = {
    public: `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=implementation'
export { createIssueServerFn }`,
    implementation: `import { createServerFn } from '@tanstack/react-start'
export const createIssueServerFn = createServerFn`,
  }
  return {
    name: 'test:virtual-server-fn-factories',
    resolveId: (source) =>
      source.startsWith('virtual:server-fn-factory?') ? `\0${source}` : null,
    load: (id) => {
      if (!id.startsWith(prefix)) {
        return null
      }
      const variant = new URLSearchParams(id.slice(prefix.length)).get(
        'variant',
      )
      return variant ? (modules[variant] ?? null) : null
    },
  }
}

/**
 * A module whose server fn builder comes from the public module of
 * `virtualFactories` (`issueServerFn`, whose handler returns
 * `'issue-handler'`).
 */
export const queryDistinctModule = `import { createIssueServerFn } from 'virtual:server-fn-factory?variant=public'
export const issueServerFn = createIssueServerFn().handler(async () => 'issue-handler')`

/**
 * Server fn builders with middleware called as factories (one chained off
 * another): `myAuthedFn` and `deleteUserFn` return their name and the
 * context their factory chain's middleware gives (`{ auth }`, then
 * `{ auth, admin }`), and their handler bodies (`MARK_*_HANDLER_BODY`) stay
 * off the client; the look-alike `createFakeFn().handler` is left alone
 * (`x` is `'fakeFn'`).
 */
export const factoryBuilderModule = `import { createServerFn, createMiddleware } from '@tanstack/react-start'
const authMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { auth: 'auth' } }),
)
const adminMiddleware = createMiddleware({ type: 'function' }).server(
  ({ next }) => next({ context: { admin: 'admin' } }),
)
export const createAuthServerFn = createServerFn().middleware([authMiddleware])
const createAdminServerFn = createAuthServerFn().middleware([adminMiddleware])
export const myAuthedFn = createAuthServerFn().handler(({ context }) => {
  return ['myAuthedFn', context, 'MARK_AUTHED_HANDLER_BODY'].slice(0, 2)
})
export const deleteUserFn = createAdminServerFn().handler(({ context }) => {
  return ['deleteUserFn', context, 'MARK_DELETE_HANDLER_BODY'].slice(0, 2)
})
function createFakeFn() {
  return {
    handler: (cb) => {
      return cb()
    },
  }
}
export const x = createFakeFn().handler(() => {
  return 'fakeFn'
})`

/**
 * The import forms of integration/pages/start-compiler-import-forms.test.ts:
 * the real modules its constructs read, and how a construct's factory is
 * imported and its call written.
 */
export const moduleFiles = {
  'db.server.ts': `export const db = { x: () => 'x' }\n`,
  'chart.client.ts': `export const chart = () => 'chart'\nexport const Chart = () => '<chart>'\n`,
}

/** How the factory `name` of `pkg` is imported and its call written. */
export interface Form {
  imports: (pkg: string, name: string) => string
  callee: (name: string) => string
  wrap: (expression: string) => string
}

export const forms: Record<string, Form> = {
  'a renamed import': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => expression,
  },
  'a namespace member': {
    imports: (pkg) => `import * as Start from '${pkg}'`,
    callee: (name) => `Start.${name}`,
    wrap: (expression) => expression,
  },
  'a call result wrapped in as': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => `(${expression}) as any`,
  },
  'a call result wrapped in satisfies': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => `(${expression}) satisfies unknown`,
  },
}

/** The imports a construct's code reads, besides the factory. */
export const moduleImports = `import { db } from './db.server'
import { chart } from './chart.client'`

/**
 * The createServerFn construct: the export `fn`, created by calling
 * `callee` with `method: 'POST'`, whose handler returns `'x'`.
 */
export const serverFnConstruct = (callee: string, wrap: Form['wrap']) =>
  `export const fn = ${wrap(`${callee}({ method: 'POST' }).handler(async () => db.x())`)}`
