/**
 * Builder shapes in a real client build, on each bundler (SPEC J4.5, J4.12,
 * G5): a shape either compiles, with its server code out of the client, or
 * fails the build at the use.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart, startBundlers } from '../build-harness'
import type { StartBundler } from '../build-harness'
import type { RsbuildConfig } from '@rsbuild/core'
import type { InlineConfig } from 'vite'

const timeout = 60_000

/** A module holding an open builder, and a server fn finished on it. */
const fooModule = `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const auth = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
export const authed = createServerFn().middleware([auth])
`

interface Compiled {
  name: string
  files: Record<string, string>
  viteConfig?: InlineConfig
  rsbuildConfig?: RsbuildConfig
  /** Default: every bundler. */
  bundlers?: Array<StartBundler>
}

interface Refused extends Compiled {
  /** Where the build fails. */
  file: string
  line: number
}

const compiled: Array<Compiled> = [
  {
    name: '`export * as` of a project module',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as middle from './foo'\n`,
      'src/entry.ts': `import { middle } from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace re-exported by name',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'\nexport { middle }\n`,
      'src/entry.ts': `import { middle } from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace as a default export',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'\nexport default middle\n`,
      'src/entry.ts': `import middle from './middle'
export const fn = middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a re-exported namespace destructured',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/entry.ts': `import { inner } from './middle'
const { authed } = inner
export const fn = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace read through a cast',
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
export const fn = (foo as any).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
]

compiled.push(
  ...[
    ['a type', `export type base = string`],
    ['an interface', `export interface base {\n  a: string\n}`],
    [
      'a type-only namespace',
      `export namespace base {\n  export type E = string\n}`,
    ],
    ['a `declare var`', `export declare var base: any`],
  ].map(([what, before]) => ({
    name: `${what} of the same name before a builder`,
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
${before}
export const base = createServerFn().middleware([])
`,
      'src/entry.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  })),
  {
    name: 'a type-only namespace after a builder of the same name',
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn().middleware([])
export namespace base {
  export type E = string
}
`,
      'src/entry.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a type of the same name before an isomorphic builder',
    files: {
      'src/entry.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
type iso = string
const iso = createIsomorphicFn()
export const f = iso.server(() => 'MARK_SERVER_SECRET').client(() => 'client')
export type { iso }
`,
    },
  },
  {
    name: '`var` declared twice, the builder in the second',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
var base: any
var base: any = createServerFn()
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'an overloaded factory',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
function make(a: 'x'): any
function make(a: string): any
function make(a: string) {
  return createServerFn()
}
export const fn = make('x').handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a type-only namespace merged with a factory',
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export namespace make {
  export type E = string
}
export function make() {
  return createServerFn()
}
`,
      'src/entry.ts': `import { make } from './b'
export const fn = make().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

const refused: Array<Refused> = [
  {
    name: '`var` redeclared with a builder after another value',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
var base: any = 1
var base: any = createServerFn()
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace behind a ternary in an object',
    file: 'src/middle.ts',
    line: 3,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
const flag = Math.random() > 2
export const bar = { middle: flag ? {} : middle }
`,
      'src/entry.ts': `import { bar } from './middle'
export const fn = (bar.middle as any).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace in an object, in the same module',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as middle from './foo'
const bar = { middle }
export const fn = bar.middle.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a function returning a namespace',
    file: 'src/middle.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
export const get = () => middle
`,
      'src/entry.ts': `import { get } from './middle'
export const fn = get().authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace spread into an object',
    file: 'src/middle.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `import * as middle from './foo'
export const bar = { ...middle }
`,
      'src/entry.ts': `import { bar } from './middle'
export const fn = bar.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace destructured with a rest element',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
const { ...rest } = foo
export const fn = rest.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace destructured with a default',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/entry.ts': `import * as foo from './foo'
const { authed = null as any } = foo
export const fn = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a re-exported namespace passed to a function',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/entry.ts': `import { inner } from './middle'
const pass = (x: any) => x
export const fn = pass(inner).authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a namespace of a module whose builder comes through `export *`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/foo.ts': fooModule,
      'src/barrel.ts': `export * from './foo'\n`,
      'src/entry.ts': `import * as barrel from './barrel'
const bar = [barrel]
export const fn = bar[0]!.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
]

refused.push(
  {
    name: 'a builder through an identity helper',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const id = <T,>(x: T) => x
export const fn = id(createServerFn()).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a builder through an identity helper that also stores it',
    file: 'src/entry.ts',
    line: 7,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const reg: any = {}
const register = <T,>(b: T): T => {
  reg.base = b
  return b
}
register(createServerFn())
export const fn = reg.base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

refused.push(
  {
    name: 'a parameter passed to `.validator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => createServerFn().validator(schema)
export const fn = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
}).handler(async () => 'x')
`,
    },
  },
  {
    name: 'a parameter passed to `.inputValidator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => (createServerFn() as any).inputValidator(schema)
export const fn = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
}).handler(async () => 'x')
`,
    },
  },
  {
    name: 'a parameter passed to a middleware’s `.validator()`',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const withInput = (schema: any) => createMiddleware({ type: 'function' }).validator(schema)
const m = withInput((d: unknown) => {
  console.log('MARK_SERVER_SECRET')
  return d
})
export const fn = createServerFn().middleware([m]).handler(async () => 'x')
`,
    },
  },
)

compiled.push({
  name: 'a method called on a server fn where it is created',
  files: {
    'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET').bind(null)
export const called = createServerFn().handler(async () => 'MARK_SERVER_SECRET').call
`,
  },
})

compiled.push(
  {
    name: 'a `let` builder reassigned with a link',
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
let base = createServerFn()
base = base.middleware([])
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a `let` builder conditionally reassigned with a link',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const mw = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
let base = createServerFn()
if (Math.random() > 2) {
  base = base.middleware([mw])
}
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

refused.push(
  {
    name: 'a `let` builder reassigned with something else',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
let base: any = createServerFn()
base = (globalThis as any).other
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a `let` holding something else, reassigned with a builder',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
let base: any = null
base = createServerFn()
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

refused.push(
  {
    name: 'a builder returned through an isomorphic fn',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'
const getBuilder = createIsomorphicFn().server(() => createServerFn()).client(() => createServerFn())
export const fn = getBuilder().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a builder returned through a client-only fn',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'
const getBuilder = createClientOnlyFn(() => createServerFn())
export const fn = () => getBuilder().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a builder as a TS namespace member',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
namespace Fns {
  export const base = createServerFn()
}
export const fn = Fns.base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

compiled.push(
  {
    name: 'a builder logged while debugging',
    files: {
      'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
const base = createServerFn()
console.log(base)
console.debug?.(base)
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
      'src/entry.ts': `export { fn } from './fns'\n`,
    },
  },
  {
    name: '`typeof` of a namespace whose module exports a builder',
    files: {
      'src/foo.ts': `${fooModule}export const getX = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
      'src/entry.ts': `import * as foo from './foo'
export const kind = typeof foo
export const call = () => foo.getX()
`,
    },
  },
)

refused.push({
  name: 'a builder passed to a local `console`',
  file: 'src/entry.ts',
  line: 3,
  files: {
    'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const console = { log: (b: any) => b.handler(async () => 'MARK_SERVER_SECRET') }
export const fn = console.log(createServerFn())
`,
  },
})

compiled.push(
  {
    name: 'a client-only middleware in a `const` list',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const logging = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
const common = [logging]
export const fn = createServerFn().middleware(common).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a client-only middleware in a conditional list',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const dev = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
export const fn = createServerFn().middleware(import.meta.env.DEV ? [dev] : []).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a composition-only middleware in a `const` list, spread',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const a = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
const combo = createMiddleware({ type: 'function' }).middleware([a])
const common = [combo]
const more = [...common]
export const fn = createServerFn().middleware(more).handler(async () => 'MARK_SERVER_SECRET')
export const other = createServerFn().middleware(common).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

refused.push(
  {
    name: 'a client-only middleware in a `const` list read elsewhere',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createMiddleware } from '@tanstack/react-start'
const logging = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
const common = [logging]
export const m = common[0]!.server(async ({ next }) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
`,
    },
  },
  {
    name: 'a client-only middleware in an exported list',
    file: 'src/list.ts',
    line: 3,
    files: {
      'src/list.ts': `import { createMiddleware } from '@tanstack/react-start'
const logging = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
export const common = [logging]
`,
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
import { common } from './list'
export const fn = createServerFn().middleware(common).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a client-only middleware in a `let` list',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const logging = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
let common = [logging]
export const fn = createServerFn().middleware(common).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a client-only isomorphic fn as a callback',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
const getTheme = createIsomorphicFn().client(() => 'dark')
export const call = () => setTimeout(getTheme)
`,
    },
  },
)

compiled.push(
  {
    name: 'a library with import-only `exports` holding a builder',
    files: {
      'node_modules/@acme/auth/package.json': JSON.stringify({
        name: '@acme/auth',
        version: '1.0.0',
        type: 'module',
        exports: { '.': { import: './b.js' } },
      }),
      'node_modules/@acme/auth/b.js': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      'src/entry.ts': `import { base } from '@acme/auth'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'an alias of the Start package',
    viteConfig: {
      resolve: { alias: { '@start': '@tanstack/react-start' } },
    },
    rsbuildConfig: {
      resolve: { alias: { '@start': '@tanstack/react-start' } },
    },
    files: {
      'src/entry.ts': `import { createServerFn } from '@start'
export const fn = createServerFn().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
)

compiled.push({
  name: 'a builder module under an alias with a colon',
  viteConfig: { resolve: { alias: { 'app:b': '/src/b.ts' } } },
  // (Rspack refuses the scheme itself)
  bundlers: ['vite'],
  files: {
    'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
    'src/entry.ts': `import { base } from 'app:b'
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
`,
  },
})

refused.push(
  {
    name: 'a marker as `export * from`',
    file: 'src/entry.ts',
    line: 1,
    files: {
      'src/marked.ts': `export * from '@tanstack/react-start/server-only'
export const s = () => 'MARK_SERVER_SECRET'
`,
      'src/entry.ts': `import { s } from './marked'
export const f = s
`,
    },
  },
  {
    name: 'a marker as a dynamic import',
    file: 'src/entry.ts',
    line: 1,
    files: {
      'src/marked.ts': `await import('@tanstack/react-start/server-only')
export const s = () => 'MARK_SERVER_SECRET'
`,
      'src/entry.ts': `import { s } from './marked'
export const f = s
`,
    },
  },
)

refused.push(
  {
    name: 'a second route factory call carrying `server`',
    file: 'src/r.tsx',
    line: 3,
    files: {
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })
export const Admin = createFileRoute('/' as any)({
  server: { handlers: { GET: async () => new Response('MARK_SERVER_SECRET') } },
})
`,
      'src/entry.ts': `export { Route, Admin } from './r'\n`,
    },
  },
  {
    name: 'a wrapped route factory call carrying `ssr`',
    file: 'src/r.tsx',
    line: 3,
    files: {
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
const withMeta = <T,>(r: T) => r
export const Route = withMeta(createFileRoute('/')({
  ssr: () => { console.log('MARK_SERVER_SECRET'); return true },
}))
`,
      'src/entry.ts': `export { Route } from './r'\n`,
    },
  },
  {
    name: 'a stored route factory called with `headers`',
    file: 'src/r.tsx',
    line: 3,
    files: {
      'src/r.tsx': `import * as R from '@tanstack/react-router'
const make = R.createFileRoute('/')
export const Route = make({
  headers: () => ({ a: 'MARK_SERVER_SECRET' }),
})
`,
      'src/entry.ts': `export { Route } from './r'\n`,
    },
  },
)

compiled.push(
  {
    name: 'a second route factory call without server options',
    files: {
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => null })
export const Other = createFileRoute('/' as any)({ component: () => null })
`,
      'src/entry.ts': `export { Route, Other } from './r'\n`,
    },
  },
  {
    name: 'a wrapped route factory call without server options',
    files: {
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
const withMeta = <T,>(r: T) => r
export const Route = withMeta(createFileRoute('/')({ component: () => null }))
`,
      'src/entry.ts': `export { Route } from './r'\n`,
    },
  },
)

compiled.push(
  {
    name: 'a builder under a cast',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const mw = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
export const a = (createServerFn() as any).handler(async () => 'MARK_SERVER_SECRET')
export const b = (createServerFn() as any).middleware([mw]).handler(async () => 'MARK_SERVER_SECRET')
export const c = (createServerFn().middleware([mw]) as any).handler(async () => 'MARK_SERVER_SECRET')
export const d = ((createServerFn() as any).middleware([mw]) as any).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'the factory’s `.call()`',
    files: {
      'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn.call(null)
export const fn = base.handler(async () => 'MARK_SERVER_SECRET')
export const direct = createServerFn.call(null, { method: 'POST' }).handler(async () => 'MARK_SERVER_SECRET')
`,
      'src/entry.ts': `export { fn, direct } from './fns'\n`,
    },
  },
)

refused.push({
  name: 'an unknown method on a builder under a cast',
  file: 'src/entry.ts',
  line: 2,
  files: {
    'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
export const fn = (createServerFn() as any).foo().handler(async () => 'MARK_SERVER_SECRET')
`,
  },
})

compiled.push(
  {
    name: 'a namespace read through another namespace',
    files: {
      'src/foo.ts': fooModule,
      'src/middle.ts': `export * as inner from './foo'\n`,
      'src/top.ts': `export * as outer from './middle'\n`,
      'src/entry.ts': `import * as m from './middle'
import { outer } from './top'
export const a = m.inner.authed.handler(async () => 'MARK_SERVER_SECRET')
export const b = outer.inner.authed.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a server fn read through a re-exported namespace with an open sibling',
    files: {
      'src/fns.ts': `${fooModule}export const getUser = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
      'src/api.ts': `export * as users from './fns'\n`,
      'src/entry.ts': `import * as api from './api'
export const call = () => api.users.getUser()
`,
    },
  },
  {
    name: 'a namespace whose module exports a builder, only read',
    files: {
      'src/foo.ts': `${fooModule}export const getX = authed.handler(async () => 'MARK_SERVER_SECRET')
`,
      'src/entry.ts': `import * as foo from './foo'
console.log(foo)
export const has = 'authed' in foo
export const yes = !foo
export const text = \`\${foo}\`
if (foo) {
  console.log('here')
}
export const call = () => foo.getX()
`,
    },
  },
  {
    name: 'a re-export cycle through a star',
    files: {
      'src/b.ts': `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`,
      'src/a.ts': `export { base as x } from './index2'\n`,
      'src/index2.ts': `export * from './a'\nexport * from './b'\n`,
      'src/entry.ts': `import { x } from './index2'
export const fn = x.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a `const` list spread twice',
    files: {
      'src/entry.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const logging = createMiddleware({ type: 'function' }).client(async ({ next }) => next())
const a = [logging]
const b = [...a, ...a]
export const fn = createServerFn().middleware(b).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'an open middleware returned through an isomorphic fn',
    files: {
      'src/entry.ts': `import { createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
const serverMw = createMiddleware().server(async ({ next }) => next())
const clerk = createIsomorphicFn().server(() => serverMw).client(() => createMiddleware())
export const gate = createMiddleware().middleware([clerk()]).server(async ({ next }) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
`,
    },
  },
  {
    name: 'a marker imported dynamically in code the client erases',
    files: {
      'src/entry.ts': `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => {
  await import('@tanstack/react-start/server-only')
  return 'MARK_SERVER_SECRET'
})
export const only = createServerOnlyFn(async () => {
  await import('@tanstack/react-start/server-only')
  return 'MARK_SERVER_SECRET'
})
`,
    },
  },
)

refused.push(
  {
    name: 'an assignment’s value finished where it is written',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
let base: any = createServerFn()
export const fn = (base = base.middleware([])).handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a closed middleware binding reassigned with an open one',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createMiddleware } from '@tanstack/react-start'
let m: any = createMiddleware({ type: 'function' }).server(async ({ next }) => next())
m = createMiddleware({ type: 'function' })
const holder = { m }
export const out = holder.m.server(async ({ next }: any) => {
  console.log('MARK_SERVER_SECRET')
  return next()
})
`,
    },
  },
  {
    name: 'a builder in an object returned through a client-only fn',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'
const get = createClientOnlyFn(() => ({ b: createServerFn() }))
export const fn = () => get().b.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a factory given to createClientOnlyFn',
    file: 'src/entry.ts',
    line: 2,
    files: {
      'src/entry.ts': `import { createClientOnlyFn, createServerFn } from '@tanstack/react-start'
const make = createClientOnlyFn(createServerFn as any) as any
export const fn = () => make().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a factory function exported by a TS namespace',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
namespace N {
  export function get(): any { return createServerFn() }
}
export const fn = N.get().handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a builder in a tagged template',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
const tag = (_: any, b: any) => b
export const fn = tag\`\${createServerFn()}\`.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: '`var` redeclared with a builder after a finished server fn',
    file: 'src/entry.ts',
    line: 3,
    files: {
      'src/entry.ts': `import { createServerFn } from '@tanstack/react-start'
var a: any = createServerFn().handler(async () => 'x')
var a: any = createServerFn()
export const fn = a.handler(async () => 'MARK_SERVER_SECRET')
`,
    },
  },
  {
    name: 'a marker imported as a namespace',
    file: 'src/entry.ts',
    line: 1,
    files: {
      'src/marked.ts': `import * as m from '@tanstack/react-start/server-only'
export const s = () => {
  console.log(m)
  return 'MARK_SERVER_SECRET'
}
`,
      'src/entry.ts': `import { s } from './marked'
export const f = s
`,
    },
  },
  {
    name: 'a second route factory call with `server` in a constant',
    file: 'src/r.tsx',
    line: 3,
    files: {
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
const opts = { server: { handlers: { GET: async () => new Response('MARK_SERVER_SECRET') } } }
export const Admin = createFileRoute('/' as any)(opts)
export const Route = createFileRoute('/')({ component: () => null })
`,
      'src/entry.ts': `export { Route, Admin } from './r'\n`,
    },
  },
)

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(compiled.filter((row) => row.bundlers?.includes(bundler) ?? true))(
    '$name compiles',
    async (row) => {
      const build = await buildStart({
        bundler,
        files: row.files,
        viteConfig: row.viteConfig,
        rsbuildConfig: row.rsbuildConfig,
        entry: 'src/entry.ts',
      })
      expect(build.client.where('MARK_SERVER_SECRET')).toBe('nowhere')
    },
    timeout,
  )

  test.each(refused)(
    '$name fails the build at the use',
    async ({ files, file, line }) => {
      const error: unknown = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
      }).then(
        (build) =>
          expect.fail(
            `the build succeeded; the handler's text is ${build.client.where('MARK_SERVER_SECRET')} in the client bundle`,
          ),
        (e: unknown) => e,
      )
      if (!(error instanceof StartBuildError)) {
        throw error
      }
      expectDiagnostic(error.diagnostics, {
        severity: 'error',
        file,
        root: error.root,
        position: { line },
      })
    },
    timeout,
  )
})
