/**
 * Start builder and factory shapes on the client (SPEC J4.5, J4.12, G5),
 * through the public Start host (`./start-host`: a Vite dev server with
 * `tanstackStart()`, a real page, real requests). A shape either compiles
 * (the page loads nothing server-only and gets none of the server code, a
 * server fn answers the page's call through the server) or the client
 * refuses the module at the use the compiler cannot follow. The server
 * compiles every shape the client refuses (recognition is the same in every
 * environment, and a server keeps its code), unless every environment
 * refuses it. A parameter that reaches server code by being read is a
 * warning at the parameter, on the client only.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { closeAfterAll } from './file-end'
import {
  callFromClient,
  compileError,
  createStartHost,
  expectCompileError,
  serveCase,
} from './regression-helpers'
import type { StartHost } from './start-host'
import type { StartCase } from './regression-helpers'

let host: StartHost
const openHost = closeAfterAll()
beforeAll(async () => {
  host = await openHost(() => createStartHost())
}, 60_000)

const DB = `export const db = { x: () => 'from the server', y: () => 'more from the server' }\n`
const P = `import { createServerFn, createMiddleware, createIsomorphicFn, createServerOnlyFn, createStart } from '@tanstack/react-start'
import { db } from './db.server'
`
const MW = `const mw = createMiddleware({ type: 'function' }).server(async ({ next }) => next())\n`

interface Shape {
  name: string
  code: string
  files?: Record<string, string>
  /** Server code the client must not hold (default `db.x()`). */
  body?: string
  /** The server fn the page calls (default `module.fn` when the module exports `fn` and calls `.handler()`). */
  call?: string
  /** What that call answers (default `'from the server'`). */
  returns?: unknown
}

/** Code the compiler does not see into: a module of opaque exports. */
const SOME_LIB = `const opaque: any = (globalThis as any).someLib ?? ((x: unknown) => x)
export const withRetry = opaque
export const wrap = opaque
export const Form = opaque
export class QueryCache { constructor(readonly options: unknown) {} }
`

/** `const v1 = v0` through `const v<n> = v<n - 1>`, one per line. */
const aliasChain = (n: number) =>
  Array.from({ length: n }, (_, i) => `const v${i + 1} = v${i}\n`).join('')

const caseFiles = (shape: Shape) => ({
  'db.server.ts': DB,
  'some-lib.ts': SOME_LIB,
  ...shape.files,
  'module.tsx': shape.code,
})

const supported: Array<Shape> = [
  // ---- import forms
  {
    name: 'named import',
    code: `${P}export const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'renamed import',
    code: `import { createServerFn as csf } from '@tanstack/react-start'\nimport { db } from './db.server'\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'a member of the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nexport const fn = S.createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'an app re-export',
    files: {
      'f.ts': `export { createServerFn } from '@tanstack/react-start'\n`,
    },
    code: `import { createServerFn } from './f'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'an app `export *`',
    files: { 'f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import { createServerFn } from './f'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a member of an app namespace',
    files: { 'f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import * as F from './f'\nimport { db } from './db.server'\nexport const fn = F.createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a const alias in another module',
    files: {
      'f.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const csf = createServerFn\n`,
    },
    code: `import { csf } from './f'\nimport { db } from './db.server'\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'a const alias',
    code: `${P}const csf = createServerFn\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'the factory as the default export of an app module',
    files: {
      'f.ts': `import { createServerFn } from '@tanstack/react-start'\nexport default createServerFn\n`,
    },
    code: `import csf from './f'\nimport { db } from './db.server'\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'a let alias never written',
    code: `${P}let csf = createServerFn\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'an alias of the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst api = S\nexport const fn = api.createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from the package namespace',
    code: `import * as Start from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { createServerFn } = Start\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from the package namespace, renamed',
    code: `import * as Start from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { createServerFn: csf } = Start\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'factories destructured from the package namespace by quoted keys',
    code: `import * as Start from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { 'createServerFn': csf, 'createIsomorphicFn': iso } = Start\nexport const read = iso().server(() => db.y()).client(() => 'client')\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from the package namespace in a function',
    code: `import * as Start from '@tanstack/react-start'\nimport { db } from './db.server'\nconst make = () => {\n  const { createServerFn } = Start\n  return createServerFn()\n}\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from an app namespace',
    files: { 'f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import * as F from './f'\nimport { db } from './db.server'\nconst { createServerFn } = F\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from the package namespace by another module',
    files: {
      'f.ts': `import * as Start from '@tanstack/react-start'\nexport const { createServerFn } = Start\n`,
    },
    code: `import { createServerFn } from './f'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a sequence callee `(0, createServerFn)()`',
    code: `${P}export const fn = (0, createServerFn)().handler(async () => db.x())`,
  },
  // ---- stored builders
  {
    name: 'a builder stored in a const',
    code: `${P}const base = createServerFn({ method: 'POST' })\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a builder with middleware stored',
    code: `${P}${MW}const base = createServerFn().middleware([mw])\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a builder another module exports',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const authed = createServerFn().middleware([])\n`,
    },
    code: `import { authed } from './b'\nimport { db } from './db.server'\nexport const fn = authed.handler(async () => db.x())`,
  },
  {
    name: 'an optional call `.handler?.()`',
    code: `${P}export const fn = createServerFn().handler?.(async () => db.x())`,
  },
  {
    name: 'an optional member `?.handler()`',
    code: `${P}export const fn = createServerFn()?.handler(async () => db.x())`,
  },
  {
    name: 'a called builder another module exports',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const createAuthServerFn = createServerFn().middleware([])\n`,
    },
    code: `import { createAuthServerFn } from './b'\nimport { db } from './db.server'\nexport const fn = createAuthServerFn().handler(async () => db.x())`,
  },
  {
    name: 'one builder handled twice',
    call: 'module.a',
    code: `${P}const base = createServerFn()\nexport const a = base.handler(async () => db.x())\nexport const b = base.handler(async () => db.y())`,
    body: 'db.y()',
  },
  {
    name: "a builder's options read by name",
    code: `${P}${MW}const base = createServerFn({ method: 'POST' })\nexport const method = base.options.method\nexport const mwType = mw.options.type\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: "a builder's options destructured by name",
    code: `${P}const base = createServerFn({ method: 'POST' })\nconst { method } = base.options\nexport const m = method\nexport const fn = base.handler(async () => db.x())`,
  },
  // ---- joins
  {
    name: 'a builder chosen by a ternary',
    code: `${P}const base = Math.random() > 2 ? createServerFn({ method: 'POST' }) : createServerFn()\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a ternary as the receiver of `.handler()`',
    code: `${P}export const fn = (Math.random() > 2 ? createServerFn() : createServerFn({ method: 'POST' })).handler(async () => db.x())`,
  },
  {
    name: 'a ternary of factories',
    code: `${P}const csf = Math.random() > 2 ? createServerFn : createServerFn\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'a ternary of builders with validators on each side',
    code: `${P}const base = Math.random() > 2 ? createServerFn().validator((d: string) => { db.y(); return d }) : createServerFn().validator((d: string) => d)\nexport const fn = base.handler(async () => db.x())`,
    body: 'db.y()',
  },
  {
    name: 'a builder from a nullish join of two builders',
    code: `${P}const base = createServerFn({ method: 'POST' }) ?? createServerFn()\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a ternary of builders another module exports',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nimport { csf } from './f'\nexport const base = Math.random() > 2 ? csf({ method: 'POST' }) : createServerFn()\n`,
      'f.ts': `export { createServerFn as csf } from '@tanstack/react-start'\n`,
    },
    code: `import { base } from './b'\nimport { db } from './db.server'\nexport const fn = base.handler(async () => db.x())`,
  },
  // ---- factories
  {
    name: 'an arrow factory',
    code: `${P}const make = () => createServerFn({ method: 'POST' })\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'an arrow factory of another module',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const make = () => createServerFn({ method: 'POST' })\n`,
    },
    code: `import { make } from './b'\nimport { db } from './db.server'\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'a function declaration with a single return',
    code: `${P}function make() {\n  return createServerFn()\n}\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'a factory with statements before its single return',
    code: `${P}function make() {\n  console.log('make')\n  const method = 'POST' as const\n  return createServerFn({ method })\n}\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'a factory with statements before its single return, in another module',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport function make() {\n  console.log('make')\n  return createServerFn()\n}\n`,
    },
    code: `import { make } from './b'\nimport { db } from './db.server'\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'a generic arrow factory',
    code: `${P}const make = <T,>(_?: T) => createServerFn()\nexport const fn = make<string>().handler(async () => db.x())`,
  },
  {
    name: 'a factory with a parameter in the options',
    code: `${P}const make = (method: 'GET' | 'POST') => createServerFn({ method })\nexport const fn = make('POST').handler(async () => db.x())`,
  },
  {
    name: 'a factory returning a chain',
    code: `${P}${MW}const make = () => createServerFn().middleware([mw])\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'an IIFE factory',
    code: `${P}const base = (() => createServerFn())()\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a factory returning a local const',
    code: `${P}function make() {\n  const b = createServerFn()\n  return b\n}\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'a curried factory',
    code: `${P}const make = () => () => createServerFn()\nexport const fn = make()().handler(async () => db.x())`,
  },
  // ---- wrappers and values passed around
  {
    name: 'a server fn passed to an unknown function',
    code: `${P}import { withRetry } from './some-lib'\nexport const fn = withRetry(createServerFn().handler(async () => db.x()))`,
  },
  {
    name: 'createServerOnlyFn of an imported implementation',
    files: {
      'impl.server.ts': `export const impl = () => 'from the server'\n`,
    },
    code: `import { createServerOnlyFn } from '@tanstack/react-start'\nimport { impl } from './impl.server'\nexport const read = createServerOnlyFn(impl)`,
    body: './impl.server',
  },
  // ---- containers of complete values, exports
  {
    name: 'a server fn as an object property',
    call: 'module.api.getX',
    code: `${P}export const api = { getX: createServerFn().handler(async () => db.x()) }`,
  },
  {
    name: 'a server fn in an array',
    call: 'module.fns[0]',
    code: `${P}export const fns = [createServerFn().handler(async () => db.x())]`,
  },
  {
    name: 'a server fn as the default export',
    call: 'module.default',
    code: `${P}export default createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a builder as the default export, handled by an importer',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport default createServerFn({ method: 'POST' })\n`,
    },
    code: `import base from './b'\nimport { db } from './db.server'\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a server fn assigned to an object property',
    call: 'module.reg.getX',
    code: `${P}export const reg: any = {}\nreg.getX = createServerFn().handler(async () => db.x())`,
  },
  {
    name: '`export { base as default }` of a builder',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nconst base = createServerFn()\nexport { base as default }\n`,
    },
    code: `import base from './b'\nimport { db } from './db.server'\nexport const fn = base.handler(async () => db.x())`,
  },
  // ---- TypeScript forms
  {
    name: '`as any`',
    code: `${P}export const fn = (createServerFn() as any).handler(async () => db.x())`,
  },
  {
    name: 'a non-null assertion',
    code: `${P}export const fn = createServerFn()!.handler(async () => db.x())`,
  },
  {
    name: '`satisfies`',
    code: `${P}export const fn = (createServerFn() satisfies object).handler(async () => db.x())`,
  },
  {
    name: '`as unknown as T` on a stored builder',
    code: `${P}const base = createServerFn() as unknown as ReturnType<typeof createServerFn>\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'an instantiation expression alias',
    code: `${P}const csf = createServerFn<'POST'>\nexport const fn = csf().handler(async () => db.x())`,
  },
  // ---- createStart and middleware
  {
    name: 'createStart with global middleware',
    code: `${P}const gm = createMiddleware({ type: 'function' }).server(async ({ next }) => { db.x(); return next() })\nexport const startInstance = createStart(() => ({ functionMiddleware: [gm] }))`,
  },
  {
    name: 'the start instance’s createMiddleware',
    code: `${P}const start = createStart(() => ({}))\nexport const m = start.createMiddleware().server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'createMiddleware destructured from a start instance',
    code: `${P}const { createMiddleware: cm } = createStart(() => ({}))\nexport const m = cm().server(async ({ next }: any) => { db.x(); return next() })`,
  },
  {
    name: 'createMiddleware destructured from a start instance of another module',
    files: {
      's.ts': `import { createStart } from '@tanstack/react-start'\nexport const startInstance = createStart(() => ({}))\n`,
    },
    code: `import { startInstance } from './s'\nimport { db } from './db.server'\nconst { createMiddleware } = startInstance\nexport const m = createMiddleware().server(async ({ next }: any) => { db.x(); return next() })`,
  },
  {
    name: 'a start instance of another module',
    files: {
      's.ts': `import { createStart } from '@tanstack/react-start'\nexport const startInstance = createStart(() => ({}))\n`,
    },
    code: `import { startInstance } from './s'\nimport { db } from './db.server'\nexport const m = startInstance.createMiddleware().server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'a function middleware’s `.server()`',
    code: `${P}export const m = createMiddleware({ type: 'function' }).server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'a middleware builder stored, `.server()` later',
    code: `${P}const base = createMiddleware({ type: 'function' })\nexport const m = base.server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'a middleware’s `.client()` in one module and `.server()` in another',
    files: {
      'b.ts': `import { createMiddleware } from '@tanstack/react-start'\nexport const base = createMiddleware({ type: 'function' }).client(async ({ next }) => next())\n`,
    },
    code: `import { base } from './b'\nimport { db } from './db.server'\nexport const m = base.server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'a middleware inline in `.middleware([…])`',
    returns: 'ok',
    code: `${P}export const fn = createServerFn().middleware([createMiddleware({ type: 'function' }).server(async ({ next }) => { db.x(); return next() })]).handler(async () => 'ok')`,
  },
  {
    name: 'a middleware’s `.server()` with a validator',
    code: `${P}export const m = createMiddleware({ type: 'function' }).validator((d: unknown) => { db.y(); return d }).server(async ({ next }) => { db.x(); return next() })`,
    body: 'db.y()',
  },
  // ---- isomorphic and env-only
  {
    name: 'an isomorphic chain',
    code: `${P}export const f = createIsomorphicFn().server(() => db.x()).client(() => 'client')`,
  },
  {
    name: 'an isomorphic `.client()` stored, `.server()` later',
    code: `${P}const base = createIsomorphicFn().client(() => 'client')\nexport const f = base.server(() => db.x())`,
  },
  {
    name: 'an isomorphic builder chosen by a ternary',
    code: `${P}const iso = Math.random() > 2 ? createIsomorphicFn() : createIsomorphicFn()\nexport const f = iso.server(() => db.x())`,
  },
  {
    name: 'an isomorphic factory',
    code: `${P}const make = () => createIsomorphicFn()\nexport const f = make().server(() => db.x()).client(() => 'client')`,
  },
  {
    name: 'a complete isomorphic fn passed around',
    code: `${P}const f = createIsomorphicFn().server(() => db.x()).client(() => 'client')\nexport const g = [f].map((h) => h)`,
  },
  {
    name: 'an isomorphic fn with a server implementation only, cast',
    code: `${P}export const f = createIsomorphicFn().server(() => db.x()) as unknown as () => string`,
  },
  {
    name: 'an isomorphic fn whose client implementation has a block body, cast',
    code: `${P}export const f = createIsomorphicFn().server(() => db.x()).client(() => { return 'client' }) as () => string`,
  },
  {
    name: 'createServerOnlyFn',
    code: `${P}export const f = createServerOnlyFn(() => db.x())`,
  },
  {
    name: 'an alias of createServerOnlyFn',
    code: `${P}const so = createServerOnlyFn\nexport const f = so(() => db.x())`,
  },
  // A barrel diamond: two stars reaching one binding under two names, or
  // through an import the module exports, are one binding (ECMAScript
  // ResolveExport compares module and binding; a namespace object is its
  // module's). Source: the Astra core review 1.
  ...[
    {
      name: 'one local exported under two names',
      left: `export { a as define } from './leaf'`,
      right: `export { b as define } from './leaf'`,
    },
    {
      name: 'one name re-exported twice',
      left: `export { a as define } from './leaf'`,
      right: `export { a as define } from './leaf'`,
    },
    {
      name: 'the package binding re-exported under two names',
      left: `export { pa as define } from './leaf'`,
      right: `export { pb as define } from './leaf'`,
    },
    {
      name: 'an imported binding exported',
      left: `import { a } from './leaf'\nexport { a as define }`,
      right: `export { b as define } from './leaf'`,
    },
    {
      name: 'the package namespace, re-exported and exported as an import',
      left: `export * as S from '@tanstack/react-start'`,
      right: `import * as S from '@tanstack/react-start'\nexport { S }`,
      define: 'S.createServerOnlyFn',
    },
  ].map(({ name, left, right, define = 'define' }) => ({
    name: `createServerOnlyFn through a barrel diamond: ${name}`,
    files: {
      'leaf.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const api = createServerOnlyFn
export { api as a, api as b }
export { createServerOnlyFn as pa, createServerOnlyFn as pb } from '@tanstack/react-start'
`,
      'left.ts': `${left}\n`,
      'right.ts': `${right}\n`,
      'barrel.ts': `export * from './left'\nexport * from './right'\n`,
    },
    code: `import { ${define.split('.')[0]} } from './barrel'\nimport { db } from './db.server'\nexport const f = ${define}(() => db.x())`,
  })),
  // Source: the Astra core review 7 (a module of 2,500 aliases overflowed
  // the compiler's stack).
  {
    name: 'createServerOnlyFn through 2,500 aliases in another module',
    files: {
      'aliases.ts': `import { createServerOnlyFn } from '@tanstack/react-start'
const v0 = createServerOnlyFn
${aliasChain(2500)}export { v2500 as define }
`,
    },
    code: `import { define } from './aliases'\nimport { db } from './db.server'\nexport const f = define(() => db.x())`,
  },
  {
    name: 'createServerOnlyFn through 2,500 aliases',
    code: `${P}const v0 = createServerOnlyFn\n${aliasChain(2500)}export const f = v2500(() => db.x())`,
  },
  {
    name: 'createServerOnlyFn in an object',
    code: `${P}export const helpers = { read: createServerOnlyFn(() => db.x()) }`,
  },
  {
    name: 'createServerOnlyFn destructured from the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { createServerOnlyFn } = S\nexport const f = createServerOnlyFn(() => db.x())`,
  },
  {
    name: 'a member call on the result of createServerOnlyFn',
    code: `${P}export const f = createServerOnlyFn(() => db.x()).bind(null)`,
  },
  {
    name: 'a reassigned `let` builder',
    code: `${P}let base = createServerFn()\nbase = base.middleware([])\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: '`renderServerComponent` in a server fn',
    code: `import { createServerFn } from '@tanstack/react-start'\nimport { renderServerComponent } from '@tanstack/react-start/rsc'\nimport { db } from './db.server'\nexport const load = createServerFn().handler(async () => renderServerComponent(db.x()))`,
  },
  {
    name: '`createCompositeComponent` in a helper only a server fn calls',
    code: `import { createServerFn } from '@tanstack/react-start'\nimport { createCompositeComponent } from '@tanstack/react-start/rsc'\nimport { db } from './db.server'\nasync function card() {\n  return createCompositeComponent(() => db.x())\n}\nexport const load = createServerFn().handler(async () => card())`,
  },
  {
    name: 'the factory’s `.call()`',
    code: `${P}export const fn = createServerFn.call(null).handler(async () => db.x())`,
  },
]

/** Open middleware (`b`: no `.server()`) and a closed one (`a`), with every factory imported. */
const MWH = `import { createClientOnlyFn, createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const a = createMiddleware({ type: 'function' }).server(({ next }) => next())
const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
`
/** A local function the compiler does not follow values into. */
const FH = `import { createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const register = (x: unknown) => x
`

interface Refused extends Shape {
  /** The text the error starts at (its first occurrence in `file`). */
  at: string
  /** The file reporting it (default: the module). */
  file?: string
  /** Every environment refuses it (an existing refusal), not only the client. */
  everyEnv?: true
}

const refused: Array<Refused> = [
  // ---- values the compiler cannot follow (each refusal's message gives a fix: start-build-message-fixes.test.ts)
  {
    name: 'an open middleware returned from an isomorphic implementation',
    code: `${MWH}const mws = createIsomorphicFn().server(() => [a, b]).client(() => [b])\nexport const startInstance = createStart(() => ({ functionMiddleware: mws() }))`,
    at: 'b])\nexport',
  },
  {
    name: 'an open middleware composed of others, returned from an isomorphic implementation',
    code: `${MWH}const both = createMiddleware({ type: 'function' }).middleware([a, b])\nconst mws = createIsomorphicFn().server(() => [a, b]).client(() => [both])\nexport const startInstance = createStart(() => ({ functionMiddleware: mws() }))`,
    at: 'both])',
  },
  {
    name: 'an open middleware returned from a `createClientOnlyFn` implementation',
    code: `${MWH}const mws = createClientOnlyFn(() => [b])\nexport const startInstance = createStart(() => ({ functionMiddleware: mws() }))`,
    at: 'b])\nexport',
  },
  {
    name: 'a function of a `createClientOnlyFn` returning an open middleware',
    code: `${MWH}const mw = createClientOnlyFn(() => b)\nexport const startInstance = createStart(() => ({ functionMiddleware: [mw()] }))`,
    at: '() => b)',
  },
  {
    name: 'a client-only isomorphic fn returned from a factory with two returns',
    code: `${FH}export function pick(on: boolean) {\n  if (on) { return createIsomorphicFn().client(() => 1) }\n  return createIsomorphicFn().client(() => 2)\n}`,
    at: 'createIsomorphicFn().client(() => 1)',
  },
  {
    name: 'an open middleware returned from a factory with two returns',
    code: `${MWH}function makeB(on: boolean) {\n  if (!on) { return createMiddleware({ type: 'function' }).client(({ next }) => next()) }\n  return b\n}\nexport const fn = createServerFn().middleware([makeB(true)]).handler(async () => 'x')`,
    at: "createMiddleware({ type: 'function' }).client(({ next }) => next()) }",
  },
  {
    name: 'a builder in a `const`, passed to a local function',
    code: `${FH}const base = createServerFn()\nregister(base)\nexport const fn = base.handler(async () => 'x')`,
    at: 'base)',
  },
  {
    name: 'a builder created inside a local call',
    code: `${FH}export const fn = (register(createServerFn()) as any).handler(async () => 'x')`,
    at: 'createServerFn())',
  },
  {
    name: 'a factory passed to a local function',
    code: `${FH}const make = (f: any) => f()\nexport const fn = make(createServerFn).handler(async () => 'x')`,
    at: 'createServerFn)',
  },
  {
    name: 'a function returning a builder, passed to a function',
    code: `${FH}const make = () => createServerFn()\nregister(make)\nexport const fn = make().handler(async () => 'x')`,
    at: 'make)',
  },
  {
    name: 'an isomorphic fn returning an open middleware, passed to a function',
    code: `${FH}const a = createMiddleware({ type: 'function' }).server(({ next }) => next())\nconst b = createMiddleware({ type: 'function' }).client(({ next }) => next())\nconst mw = createIsomorphicFn().server(() => a).client(() => b)\nregister(mw)`,
    at: 'mw)',
  },
  {
    name: "a builder's middleware list destructured off its options",
    code: `${FH}const base = createServerFn().middleware([])\nconst { middleware } = base.options\nexport const mws = middleware\nexport const fn = base.handler(async () => 'x')`,
    at: 'base.options\nexport',
  },
  {
    name: "a builder's options passed on",
    code: `${FH}const base = createServerFn({ method: 'POST' })\nregister(base.options)\nexport const fn = base.handler(async () => 'x')`,
    at: 'base.options)',
  },
  {
    name: 'a factory returned from a getter',
    code: `${FH}const own = { get make() { return createServerFn } }\nexport const o = own`,
    at: 'createServerFn } }',
  },
  {
    name: 'a start instance passed to a function',
    code: `${FH}const si = createStart(() => ({}))\nregister(si)\nexport const startInstance = si`,
    at: 'si)',
  },

  // ---- import forms
  {
    name: 'a computed member of the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nexport const fn = S['createServerFn']().handler(async () => db.x())`,
    at: `S['createServerFn']`,
  },
  {
    name: 'the package namespace passed to a function',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst pick = (s: any) => s.createServerFn\nexport const fn = pick(S)().handler(async () => db.x())`,
    at: 'S)()',
  },
  {
    name: 'a factory destructured with a default from the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { createServerFn = S.createServerFn } = S\nexport const fn = createServerFn().handler(async () => db.x())`,
    // (at the default value: the factory the default reads)
    at: 'S.createServerFn } = S',
  },
  {
    name: 'a factory destructured with a default that is no factory',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { createServerFn: csf = (() => null) as never } = S\nexport const fn = csf().handler(async () => db.x())`,
    at: 'createServerFn: csf =',
  },
  {
    name: 'a factory destructured from a nested pattern',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { a: { createServerFn } } = { a: S }\nexport const fn = createServerFn().handler(async () => db.x())`,
    // (at the namespace the pattern reads into)
    at: 'S }',
  },
  {
    name: 'the rest of the package namespace',
    code: `import * as S from '@tanstack/react-start'\nimport { db } from './db.server'\nconst { ...rest } = S\nexport const fn = rest.createServerFn().handler(async () => db.x())`,
    at: '...rest',
  },
  // ---- builders
  {
    name: 'a builder method read into a variable',
    code: `${P}const handler = createServerFn().handler\nexport const fn = handler(async () => db.x())`,
    at: 'createServerFn().handler\n',
  },
  {
    name: 'a builder method destructured',
    code: `${P}const { handler } = createServerFn()\nexport const fn = handler(async () => db.x())`,
    at: '{ handler }',
  },
  {
    name: '`.handler.call()`',
    code: `${P}export const fn = createServerFn().handler.call(null, async () => db.x())`,
    at: 'createServerFn().handler.call',
  },
  {
    name: 'a computed `.handler`',
    code: `${P}export const fn = createServerFn()['handler'](async () => db.x())`,
    at: `createServerFn()['handler']`,
  },
  {
    name: 'an unknown builder method',
    code: `${P}export const fn = (createServerFn() as any).foo().handler(async () => db.x())`,
    at: '(createServerFn() as any).foo',
  },
  {
    name: 'a builder local to a function, handled there',
    code: `${P}export function make() {\n  const b = createServerFn()\n  return b.handler(async () => db.x())\n}`,
    at: 'b.handler',
    everyEnv: true,
  },
  {
    name: 'a property of a builder',
    code: `${P}const options = createServerFn().options\nexport const fn = createServerFn().handler(async () => db.x())\nexport const o = options`,
    at: 'createServerFn().options',
  },
  {
    name: "a write to a builder's options",
    code: `${P}const base = createServerFn({ method: 'POST' })\nbase.options.validator = (data: unknown) => db.x()\nexport const fn = base.handler(async () => db.x())`,
    at: 'base.options.validator',
  },
  {
    name: "a builder's middleware list read off its options",
    code: `${P}const base = createServerFn().middleware([createMiddleware({ type: 'function' })])\nexport const fn = base.handler(async () => 'x')\nexport const m = (base.options.middleware as any)[0].server(async ({ next }: any) => { db.x(); return next() })`,
    at: 'base.options.middleware',
  },
  {
    name: 'a builder awaited',
    code: `${P}export const fn = (await createServerFn()).handler(async () => db.x())`,
    at: 'createServerFn())',
  },
  // ---- joins
  {
    name: 'a builder joined with another value',
    code: `${P}const base = (globalThis as any).x || createServerFn()\nexport const fn = base.handler(async () => db.x())`,
    at: 'createServerFn()\n',
  },
  {
    name: 'builders of two kinds joined',
    code: `${P}const base: any = Math.random() > 2 ? createServerFn() : createMiddleware()\nexport const fn = base.handler(async () => db.x())`,
    at: 'createServerFn() :',
  },
  // ---- factories
  {
    name: 'a block-bodied factory that returns a builder from an `if`',
    code: `${P}function make(post: boolean) {\n  if (post) {\n    return createServerFn({ method: 'POST' })\n  }\n  return createServerFn()\n}\nexport const fn = make(false).handler(async () => db.x())`,
    at: `createServerFn({ method: 'POST' })`,
  },
  {
    name: 'a factory returning from a `try`',
    code: `${P}function make() {\n  try {\n    return createServerFn()\n  } finally {\n  }\n}\nexport const fn = make().handler(async () => db.x())`,
    at: 'createServerFn()\n',
  },
  {
    name: 'an async factory',
    code: `${P}const make = async () => createServerFn()\nexport const fn = (await make()).handler(async () => db.x())`,
    at: 'createServerFn()\n',
  },
  {
    name: 'an object method factory',
    code: `${P}const api = { make() { return createServerFn() } }\nexport const fn = api.make().handler(async () => db.x())`,
    at: 'createServerFn() }',
  },
  {
    name: 'a class static method factory',
    code: `${P}class Fns { static make() { return createServerFn() } }\nexport const fn = Fns.make().handler(async () => db.x())`,
    at: 'createServerFn() }',
  },
  {
    name: 'a factory taking the handler',
    code: `${P}const make = (h: () => Promise<string>) => createServerFn().handler(h)\nexport const fn = make(async () => db.x())`,
    at: 'h)\n',
    everyEnv: true,
  },
  {
    name: 'a factory of another module taking the handler',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const make = (h: () => Promise<string>) => createServerFn().handler(h)\n`,
    },
    code: `import { make } from './b'\nimport { db } from './db.server'\nexport const fn = make(async () => db.x())`,
    at: 'h)\n',
    file: 'b.ts',
    everyEnv: true,
  },
  // ---- wrappers, values passed to unknown code
  {
    name: 'a wrapper passing its argument to createServerOnlyFn',
    code: `${P}const serverOnly = <T extends () => unknown>(fn: T) => createServerOnlyFn(fn)\nexport const read = serverOnly(() => db.x())`,
    at: 'fn)\nexport',
  },
  {
    name: 'a wrapper of another module passing its argument to createServerOnlyFn',
    files: {
      'w.ts': `import { createServerOnlyFn } from '@tanstack/react-start'\nexport const serverOnly = <T extends () => unknown>(fn: T) => createServerOnlyFn(fn)\n`,
    },
    code: `import { serverOnly } from './w'\nimport { db } from './db.server'\nexport const read = serverOnly(() => db.x())`,
    at: 'fn)\n',
    file: 'w.ts',
  },
  {
    name: 'an isomorphic HOF',
    code: `${P}const iso = (s: () => string, c: () => string) => createIsomorphicFn().server(s).client(c)\nexport const getX = iso(() => db.x(), () => 'client')`,
    at: 's).client',
  },
  {
    name: 'a middleware HOF',
    code: `${P}const serverMw = (fn: any) => createMiddleware().server(fn)\nexport const m = serverMw(async ({ next }: any) => { db.x(); return next() })`,
    at: 'fn)\nexport',
  },
  {
    name: 'a destructured parameter passed as `.server()`',
    code: `${P}const mw = ({ handler }: any) => createMiddleware().server(handler)\nexport const m = mw({ handler: async ({ next }: any) => { db.x(); return next() } })`,
    at: 'handler)\nexport',
  },
  {
    name: '`renderServerComponent` outside a server fn',
    code: `import { renderServerComponent } from '@tanstack/react-start/rsc'\nimport { Secret } from './db.server'\nexport const load = () => renderServerComponent(<Secret />)`,
    at: 'renderServerComponent(<',
  },
  {
    name: '`createCompositeComponent` outside a server fn',
    code: `import { createCompositeComponent } from '@tanstack/react-start/rsc'\nimport { Secret } from './db.server'\nexport const load = () => createCompositeComponent(() => <Secret />)`,
    at: 'createCompositeComponent(()',
  },
  {
    name: 'a parameter passed as a validator',
    code: `${P}export const make = (schema: any) => createMiddleware({ type: 'function' }).validator(schema)`,
    at: 'schema)',
  },
  {
    name: 'a parameter passed as server code under a cast, client code reading it too',
    code: `${P}const serverOnly = (fn: any) => { console.log(fn); return createServerOnlyFn(fn as () => string) }\nexport const read = serverOnly(() => db.x())`,
    at: 'fn as ()',
  },
  {
    name: 'a builder passed to an unknown function',
    code: `${P}import { wrap } from './some-lib'\nexport const fn = wrap(createServerFn()).handler(async () => db.x())`,
    at: 'createServerFn())',
  },
  {
    name: 'createServerOnlyFn passed as a callback',
    code: `${P}export const fns = [() => db.x()].map(createServerOnlyFn)`,
    at: 'createServerOnlyFn)',
  },
  {
    name: 'a builder passed to a local function that handles it',
    code: `${P}function attach(b: any) {\n  return b.handler(async () => db.x())\n}\nexport const fn = attach(createServerFn())`,
    at: 'createServerFn())',
  },
  {
    name: 'a builder inside useMemo',
    code: `${P}import { useMemo } from 'react'\nexport function useFn() {\n  const b = useMemo(() => createServerFn(), [])\n  return b\n}`,
    at: '() => createServerFn()',
  },
  {
    name: 'a builder as a JSX prop',
    code: `${P}import { Form } from './some-lib'\nexport const Page = () => <Form fn={createServerFn()} />`,
    at: 'createServerFn()}',
  },
  {
    name: 'a client-only isomorphic fn passed to unknown code',
    code: `${P}import { QueryCache } from './some-lib'\nexport const cache = new QueryCache({ onError: createIsomorphicFn().client(() => 'client') })`,
    at: 'createIsomorphicFn().client',
  },
  {
    name: 'a client-only middleware stored in an object',
    code: `${P}export const mws = { log: createMiddleware({ type: 'function' }).client(async ({ next }) => next()) }`,
    at: 'createMiddleware(',
  },
  // ---- containers, class fields, assignments
  {
    name: 'a builder in an object literal',
    code: `${P}const builders = { post: createServerFn({ method: 'POST' }) }\nexport const fn = builders.post.handler(async () => db.x())`,
    at: `createServerFn({ method: 'POST' })`,
  },
  {
    name: 'a builder in an array',
    code: `${P}const bs = [createServerFn()]\nexport const fn = bs[0]!.handler(async () => db.x())`,
    at: 'createServerFn()]',
  },
  {
    name: 'a builder in a Map',
    code: `${P}const m = new Map([['a', createServerFn()]])\nexport const fn = m.get('a')!.handler(async () => db.x())`,
    at: 'createServerFn()]',
  },
  {
    name: 'a builder as a class field',
    code: `${P}export class Api {\n  base = createServerFn()\n  getX = this.base.handler(async () => db.x())\n}`,
    at: 'createServerFn()\n',
  },
  {
    name: 'a builder assigned to an object property',
    code: `${P}const reg: any = {}\nreg.base = createServerFn()\nexport const fn = reg.base.handler(async () => db.x())`,
    at: 'createServerFn()\n',
  },
  {
    name: 'a builder another module exports inside an object',
    files: {
      'b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const builders = { post: createServerFn({ method: 'POST' }) }\n`,
    },
    code: `import { builders } from './b'\nimport { db } from './db.server'\nexport const fn = builders.post.handler(async () => db.x())`,
    at: `createServerFn({ method: 'POST' })`,
    file: 'b.ts',
  },
  {
    name: 'a middleware builder in an object',
    code: `${P}const mws = { auth: createMiddleware({ type: 'function' }) }\nexport const m = mws.auth.server(async ({ next }) => { db.x(); return next() })`,
    at: `createMiddleware({ type: 'function' }) }`,
  },
  // ---- env-only
  {
    name: 'createServerOnlyFn’s `.call()`',
    code: `${P}export const f = createServerOnlyFn.call(null, () => db.x())`,
    at: 'createServerOnlyFn.call',
  },
  {
    name: 'createServerOnlyFn’s `.apply()`',
    code: `${P}export const f = createServerOnlyFn.apply(null, [() => db.x()])`,
    at: 'createServerOnlyFn.apply',
  },
]

interface Warned extends Shape {
  /** The parameter the warning starts at. */
  at: string
  /** Text of the call's argument the client still holds. */
  ships?: string
  /** Where the warning says to read a secret instead (diagnostics spike D1: the API the server code is written in). */
  inside: string
}

const warned: Array<Warned> = [
  {
    name: 'a middleware factory reading its parameter in `.server()`',
    code: `${P}const requireRole = (role: string) => createMiddleware().server(async ({ next }) => { if (db.x() !== role) throw new Error('no'); return next() })\nexport const fn = createServerFn().middleware([requireRole('admin')]).handler(async () => 'ok')`,
    at: 'role: string',
    ships: 'admin',
    inside: '`.server()`',
  },
  {
    name: 'an options parameter read in `.server()`',
    code: `${P}const guard = (options: { rules: string }) => createMiddleware().server(async ({ next }) => { db.y(options.rules); return next() })\nexport const m = guard({ rules: 'RULES' })`,
    at: 'options:',
    body: 'db.y',
    ships: 'RULES',
    inside: '`.server()`',
  },
  {
    name: 'an isomorphic factory reading its parameter in `.server()`',
    code: `${P}export const make = (name: string) => createIsomorphicFn().server(() => db.y(name))`,
    at: 'name:',
    body: 'db.y',
    inside: '`.server()`',
  },
  {
    name: 'a destructured parameter read in `.server()`',
    code: `${P}export const make = ({ role }: { role: string }) => createMiddleware().server(async ({ next }) => { db.y(role); return next() })`,
    at: 'role }',
    body: 'db.y',
    inside: '`.server()`',
  },
  {
    name: 'a server-only fn reading a parameter',
    code: `${P}export const make = (n: number) => createServerOnlyFn(() => db.y(n))`,
    at: 'n:',
    body: 'db.y',
    inside: '`createServerOnlyFn()`',
  },
]

const unwarned: Array<Shape> = [
  {
    name: 'a parameter client code reads too',
    code: `${P}export const make = (label: string) => createIsomorphicFn().server(() => db.x() + label).client(() => label)`,
  },
  {
    name: 'a wrapper only erased code reads',
    code: `${P}const local = (fn: () => string) => createServerOnlyFn(fn)\nexport const fn = createServerFn().handler(async () => local(() => db.x()))`,
  },
  {
    name: 'a wrapper inside server code',
    code: `${P}export const fn = createServerFn().handler(async () => { const local = (f: () => string) => createServerOnlyFn(f); return local(() => db.x()) })`,
  },
]

describe('builder shapes the client compiles', () => {
  test.each(supported)('$name', async (shape) => {
    const served = await serveCase(host, caseFiles(shape))
    for (const file of Object.keys(shape.files ?? {})) {
      for (const environment of ['client', 'ssr'] as const) {
        expect(
          await compileError(served, environment, file),
          `${environment}: ${file}`,
        ).toBeUndefined()
      }
    }
    const body = shape.body ?? 'db.x()'
    expectNotLoaded(await served.loads(), [
      body.startsWith('./') ? body : './db.server',
    ])
    expect(served.code.client).not.toContain(body)
    const call =
      shape.call ??
      (/export const fn = /.test(shape.code) &&
      /\.handler(\?\.)?\(/.test(shape.code)
        ? 'module.fn'
        : undefined)
    if (call !== undefined) {
      expect(await callFromClient(served, call)).toEqual(
        shape.returns ?? 'from the server',
      )
    }
  })
})

/**
 * 32 modules, each starring the next two, the last starring the first (a
 * cycle) and the module that exports the factory, which only the end of
 * the cycle reaches.
 */
const starCycle = {
  'm0.ts': `export const v0 = 0\nexport * from './m1'\nexport * from './m2'\n`,
  'm1.ts': `export const v1 = 1\nexport * from './m2'\nexport * from './m3'\n`,
  'm2.ts': `export const v2 = 2\nexport * from './m3'\nexport * from './m4'\n`,
  'm3.ts': `export const v3 = 3\nexport * from './m4'\nexport * from './m5'\n`,
  'm4.ts': `export const v4 = 4\nexport * from './m5'\nexport * from './m6'\n`,
  'm5.ts': `export const v5 = 5\nexport * from './m6'\nexport * from './m7'\n`,
  'm6.ts': `export const v6 = 6\nexport * from './m7'\nexport * from './m8'\n`,
  'm7.ts': `export const v7 = 7\nexport * from './m8'\nexport * from './m9'\n`,
  'm8.ts': `export const v8 = 8\nexport * from './m9'\nexport * from './m10'\n`,
  'm9.ts': `export const v9 = 9\nexport * from './m10'\nexport * from './m11'\n`,
  'm10.ts': `export const v10 = 10\nexport * from './m11'\nexport * from './m12'\n`,
  'm11.ts': `export const v11 = 11\nexport * from './m12'\nexport * from './m13'\n`,
  'm12.ts': `export const v12 = 12\nexport * from './m13'\nexport * from './m14'\n`,
  'm13.ts': `export const v13 = 13\nexport * from './m14'\nexport * from './m15'\n`,
  'm14.ts': `export const v14 = 14\nexport * from './m15'\nexport * from './m16'\n`,
  'm15.ts': `export const v15 = 15\nexport * from './m16'\nexport * from './m17'\n`,
  'm16.ts': `export const v16 = 16\nexport * from './m17'\nexport * from './m18'\n`,
  'm17.ts': `export const v17 = 17\nexport * from './m18'\nexport * from './m19'\n`,
  'm18.ts': `export const v18 = 18\nexport * from './m19'\nexport * from './m20'\n`,
  'm19.ts': `export const v19 = 19\nexport * from './m20'\nexport * from './m21'\n`,
  'm20.ts': `export const v20 = 20\nexport * from './m21'\nexport * from './m22'\n`,
  'm21.ts': `export const v21 = 21\nexport * from './m22'\nexport * from './m23'\n`,
  'm22.ts': `export const v22 = 22\nexport * from './m23'\nexport * from './m24'\n`,
  'm23.ts': `export const v23 = 23\nexport * from './m24'\nexport * from './m25'\n`,
  'm24.ts': `export const v24 = 24\nexport * from './m25'\nexport * from './m26'\n`,
  'm25.ts': `export const v25 = 25\nexport * from './m26'\nexport * from './m27'\n`,
  'm26.ts': `export const v26 = 26\nexport * from './m27'\nexport * from './m28'\n`,
  'm27.ts': `export const v27 = 27\nexport * from './m28'\nexport * from './m29'\n`,
  'm28.ts': `export const v28 = 28\nexport * from './m29'\nexport * from './m30'\n`,
  'm29.ts': `export const v29 = 29\nexport * from './m30'\nexport * from './m31'\n`,
  'm30.ts': `export const v30 = 30\nexport * from './m31'\n`,
  'm31.ts': `export const v31 = 31\nexport * from './m0'\nexport * from './factory'\n`,
  'factory.ts': `export { createServerFn } from '@tanstack/react-start'\n`,
}

// A lookup through a dense `export *` graph with a cycle took every path
// through it: exponential in the modules (seconds at 32, half a minute at
// 36). A lookup visits each module once.
test('createServerFn through a cyclic `export *` graph of 32 modules compiles in well under a second', async () => {
  const startCase = await host.case(
    caseFiles({
      name: 'star cycle',
      files: starCycle,
      code: `import { createServerFn } from './m0'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
    }),
  )
  const started = performance.now()
  const client = await startCase.served('module.tsx', 'client')
  expect(performance.now() - started).toBeLessThan(1000)
  expect(client).not.toContain('db.x()')
  expect(await callFromClient(startCase, 'module.fn')).toBe('from the server')
})

describe('builder shapes the client refuses at the use', () => {
  test.each(refused)('$name', async (shape) => {
    const startCase = await host.case(caseFiles(shape))
    const file = shape.file ?? 'module.tsx'
    const source = file === 'module.tsx' ? shape.code : shape.files![file]!
    expect(source).toContain(shape.at)
    expectCompileError(await compileError(startCase, 'client', file), {
      source,
      at: shape.at,
      column: true,
    })
    if (shape.everyEnv) {
      expectCompileError(await compileError(startCase, 'ssr', file), {
        source,
        at: shape.at,
        column: true,
      })
      return
    }
    for (const f of Object.keys(caseFiles(shape))) {
      expect(
        await compileError(startCase, 'ssr', f),
        `ssr: ${f}`,
      ).toBeUndefined()
    }
  })
})

/** The warnings and errors of `file` an environment's compile of the case reports. */
async function reportedBy(startCase: StartCase, environment: 'client' | 'ssr') {
  const mark = startCase.diagnostics().length
  const code = await startCase.served('module.tsx', environment)
  const reported = startCase.diagnostics().slice(mark)
  return {
    code,
    of: (severity: 'warning' | 'error') =>
      findDiagnostics(reported, { severity, file: startCase.file() }),
    /** Asserts that the compile reported nothing of `severity` about the file. */
    expectNone: (severity: 'warning' | 'error') =>
      expectNoDiagnostic(reported, { severity, file: startCase.file() }),
    reported,
  }
}

describe('a parameter that reaches server code by being read', () => {
  test.each(warned)('warns once at the definition: $name', async (shape) => {
    const startCase = await host.case(caseFiles(shape))
    const client = await reportedBy(startCase, 'client')
    client.expectNone('error')
    const found = findDiagnostics(client.reported, {
      severity: 'warning',
      file: startCase.file(),
      position: diagnosticPosition(shape.code, shape.at),
      times: 1,
    })
    expect(found).toHaveLength(1)
    expect(found[0]!.text).toContain(`Read secrets inside ${shape.inside}`)
    expect(client.of('warning')).toHaveLength(1)
    expect(client.code).not.toContain(shape.body ?? 'db.x()')
    if (shape.ships) {
      expect(client.code).toContain(shape.ships)
    }
    const ssr = await reportedBy(startCase, 'ssr')
    ssr.expectNone('warning')
    ssr.expectNone('error')
  })

  test.each(unwarned)('says nothing: $name', async (shape) => {
    const startCase = await host.case(caseFiles(shape))
    const client = await reportedBy(startCase, 'client')
    client.expectNone('error')
    client.expectNone('warning')
  })
})
