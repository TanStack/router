/**
 * Start builder and factory shapes on the client (SPEC J4.5, J4.12, G5): a
 * shape is either compiled (no server code, nothing server-only loaded, the
 * server fn becomes an RPC stub) or the client build fails at the use the
 * compiler cannot follow. Server environments compile every shape the
 * client refuses: recognition is the same in every environment, and a
 * server keeps its code. Through `compileModule` and an in-memory host.
 */
import { describe, expect, it } from 'vitest'
import { parseSync } from 'vite'
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startEnvPlanner } from '../../src/planners'
import { MemoryHost, envInfo, ssrEnv } from './memory-host'
import type { StartEnvConfig } from '../../src/planners'
import type { EnvInfo } from '@tanstack/router-utils/compiler'

const ROOT = '/app'
const FILE = '/app/src/module.tsx'
const planners = [startEnvPlanner()]
const DB = `export const db = { x: () => 'from the server', y: () => 'more from the server' }\n`
const P = `import { createServerFn, createMiddleware, createIsomorphicFn, createServerOnlyFn, createStart } from '@tanstack/react-start'
import { db } from './db.server'
`
const MW = `const mw = createMiddleware({ type: 'function' }).server(async ({ next }) => next())\n`

const config: StartEnvConfig = {
  framework: 'react',
  root: ROOT,
  providerSeparate: false,
  idMode: 'dev',
}
const compileConfig = { configKey: 'cfg', perPlanner: { [START_ENV]: config } }

const clientEnvs: Array<[string, EnvInfo]> = [
  ['client (dev)', envInfo()],
  ['client (build)', envInfo({ mode: 'build' })],
]

interface Shape {
  name: string
  code: string
  files?: Record<string, string>
  /** Server code the client must not hold (default `db.x()`). */
  body?: string
}

function hostOf(shape: Shape): MemoryHost {
  return new MemoryHost(
    { [FILE]: shape.code, '/app/src/db.server.ts': DB, ...shape.files },
    { recognizer: startRecognizer() },
  )
}

async function compileAll(shape: Shape, env: EnvInfo) {
  const host = hostOf(shape)
  const outputs = new Map<string, { code: string; errors: Array<number> }>()
  for (const file of [FILE, ...Object.keys(shape.files ?? {})]) {
    const out = await host.compile(file, planners, {
      env,
      config: compileConfig,
    })
    outputs.set(file, {
      code: out?.code ?? host.files[file]!,
      errors: (out?.diagnostics ?? [])
        .filter((d) => d.severity === 'error')
        .map((d) => d.range?.start ?? -1),
    })
  }
  return outputs
}

function expectValid(code: string): void {
  const { errors } = parseSync('module.tsx', code, { sourceType: 'module' })
  expect(errors.map((e) => e.message)).toEqual([])
}

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
      '/app/src/f.ts': `export { createServerFn } from '@tanstack/react-start'\n`,
    },
    code: `import { createServerFn } from './f'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'an app `export *`',
    files: { '/app/src/f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import { createServerFn } from './f'\nimport { db } from './db.server'\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a member of an app namespace',
    files: { '/app/src/f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import * as F from './f'\nimport { db } from './db.server'\nexport const fn = F.createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a const alias in another module',
    files: {
      '/app/src/f.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const csf = createServerFn\n`,
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
      '/app/src/f.ts': `import { createServerFn } from '@tanstack/react-start'\nexport default createServerFn\n`,
    },
    code: `import csf from './f'\nimport { db } from './db.server'\nexport const fn = csf().handler(async () => db.x())`,
  },
  {
    name: 'a string export name re-export',
    files: {
      '/app/src/f.ts': `export { createServerFn as 'csf' } from '@tanstack/react-start'\n`,
    },
    code: `import { 'csf' as csf } from './f'\nimport { db } from './db.server'\nexport const fn = csf().handler(async () => db.x())`,
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
    name: 'the factory destructured from the package namespace in a function',
    code: `import * as Start from '@tanstack/react-start'\nimport { db } from './db.server'\nconst make = () => {\n  const { createServerFn } = Start\n  return createServerFn()\n}\nexport const fn = make().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from an app namespace',
    files: { '/app/src/f.ts': `export * from '@tanstack/react-start'\n` },
    code: `import * as F from './f'\nimport { db } from './db.server'\nconst { createServerFn } = F\nexport const fn = createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'the factory destructured from the package namespace by another module',
    files: {
      '/app/src/f.ts': `import * as Start from '@tanstack/react-start'\nexport const { createServerFn } = Start\n`,
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
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const authed = createServerFn().middleware([])\n`,
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
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const createAuthServerFn = createServerFn().middleware([])\n`,
    },
    code: `import { createAuthServerFn } from './b'\nimport { db } from './db.server'\nexport const fn = createAuthServerFn().handler(async () => db.x())`,
  },
  {
    name: 'one builder handled twice',
    code: `${P}const base = createServerFn()\nexport const a = base.handler(async () => db.x())\nexport const b = base.handler(async () => db.y())`,
    body: 'db.y()',
  },
  // ---- joins
  {
    name: 'a builder chosen by a ternary',
    code: `${P}const base = Math.random() > 2 ? createServerFn({ method: 'POST' }) : createServerFn()\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a ternary of two server fns',
    code: `${P}export const fn = Math.random() > 2 ? createServerFn().handler(async () => db.x()) : createServerFn().handler(async () => db.y())`,
    body: 'db.y()',
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
    code: `${P}const base = Math.random() > 2 ? createServerFn().inputValidator((d: string) => { db.y(); return d }) : createServerFn().inputValidator((d: string) => d)\nexport const fn = base.handler(async () => db.x())`,
    body: 'db.y()',
  },
  {
    name: 'a builder from a nullish join of two builders',
    code: `${P}const base = createServerFn({ method: 'POST' }) ?? createServerFn()\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a ternary of builders another module exports',
    files: {
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nimport { csf } from './f'\nexport const base = Math.random() > 2 ? csf({ method: 'POST' }) : createServerFn()\n`,
      '/app/src/f.ts': `export { createServerFn as csf } from '@tanstack/react-start'\n`,
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
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport const make = () => createServerFn({ method: 'POST' })\n`,
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
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport function make() {\n  console.log('make')\n  return createServerFn()\n}\n`,
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
    name: 'an identity wrapper of a builder',
    code: `${P}const id = <T,>(x: T) => x\nexport const fn = id(createServerFn()).handler(async () => db.x())`,
  },
  {
    name: 'a server fn passed to an unknown function',
    code: `${P}import { withRetry } from 'some-lib'\nexport const fn = withRetry(createServerFn().handler(async () => db.x()))`,
  },
  {
    name: 'createServerOnlyFn of an imported implementation',
    files: {
      '/app/src/impl.server.ts': `export const impl = () => 'from the server'\n`,
    },
    code: `import { createServerOnlyFn } from '@tanstack/react-start'\nimport { impl } from './impl.server'\nexport const read = createServerOnlyFn(impl)`,
    body: './impl.server',
  },
  // ---- containers of complete values, exports
  {
    name: 'a server fn as an object property',
    code: `${P}export const api = { getX: createServerFn().handler(async () => db.x()) }`,
  },
  {
    name: 'a server fn in an array',
    code: `${P}export const fns = [createServerFn().handler(async () => db.x())]`,
  },
  {
    name: 'a server fn as a class field',
    code: `${P}export class Api {\n  getX = createServerFn().handler(async () => db.x())\n}`,
  },
  {
    name: 'a server fn as the default export',
    code: `${P}export default createServerFn().handler(async () => db.x())`,
  },
  {
    name: 'a builder as the default export, handled by an importer',
    files: {
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nexport default createServerFn({ method: 'POST' })\n`,
    },
    code: `import base from './b'\nimport { db } from './db.server'\nexport const fn = base.handler(async () => db.x())`,
  },
  {
    name: 'a server fn assigned to an object property',
    code: `${P}export const reg: any = {}\nreg.getX = createServerFn().handler(async () => db.x())`,
  },
  {
    name: '`export { base as default }` of a builder',
    files: {
      '/app/src/b.ts': `import { createServerFn } from '@tanstack/react-start'\nconst base = createServerFn()\nexport { base as default }\n`,
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
      '/app/src/s.ts': `import { createStart } from '@tanstack/react-start'\nexport const startInstance = createStart(() => ({}))\n`,
    },
    code: `import { startInstance } from './s'\nimport { db } from './db.server'\nconst { createMiddleware } = startInstance\nexport const m = createMiddleware().server(async ({ next }: any) => { db.x(); return next() })`,
  },
  {
    name: 'a start instance of another module',
    files: {
      '/app/src/s.ts': `import { createStart } from '@tanstack/react-start'\nexport const startInstance = createStart(() => ({}))\n`,
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
      '/app/src/b.ts': `import { createMiddleware } from '@tanstack/react-start'\nexport const base = createMiddleware({ type: 'function' }).client(async ({ next }) => next())\n`,
    },
    code: `import { base } from './b'\nimport { db } from './db.server'\nexport const m = base.server(async ({ next }) => { db.x(); return next() })`,
  },
  {
    name: 'a middleware inline in `.middleware([…])`',
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
    name: 'createServerOnlyFn',
    code: `${P}export const f = createServerOnlyFn(() => db.x())`,
  },
  {
    name: 'an alias of createServerOnlyFn',
    code: `${P}const so = createServerOnlyFn\nexport const f = so(() => db.x())`,
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
]

describe('builder shapes the client compiles', () => {
  it.each(supported)('$name', async (shape) => {
    const body = shape.body ?? 'db.x()'
    for (const [label, env] of clientEnvs) {
      const outputs = await compileAll(shape, env)
      for (const [file, out] of outputs) {
        expect({ label, file, errors: out.errors }).toEqual({
          label,
          file,
          errors: [],
        })
        expectValid(out.code)
      }
      const module = outputs.get(FILE)!.code
      expect({
        label,
        holdsServerCode: module.includes(body),
        loadsServerOnly: [...outputs.values()].some((o) =>
          /\.server['"]/.test(o.code),
        ),
      }).toEqual({ label, holdsServerCode: false, loadsServerOnly: false })
      if (/\.handler(\?\.)?\(/.test(shape.code)) {
        expect(module).toContain('@tanstack/react-start/client-rpc')
      }
    }
    const ssr = await compileAll(shape, ssrEnv)
    for (const [file, out] of ssr) {
      expect({ file, errors: out.errors }).toEqual({ file, errors: [] })
    }
  })
})
