/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  compileAll,
  compileCode,
  compileErrorMessage,
  compileFor,
  createStartCompiler,
  directivePrologue,
  evaluateModule,
  importSources,
  outputs,
  serverOnlyError,
  settle,
} from './regression-helpers'
import type { ModuleStub, Output } from './regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = './db.server'

/**
 * Calls every server fn the client build reports through the provider
 * export it names, like the server-function router. Returns the compiled
 * outputs and the results of the calls.
 */
async function callServerFns(
  code: string,
  options: {
    directives?: Array<string>
    stubs?: Record<string, ModuleStub>
  } = {},
) {
  const compiled = await compileAll(code, options)
  const module = await evaluateModule(compiled.provider, options.stubs)
  const results = await Promise.all(
    Object.values(compiled.serverFns).map(({ functionName }) =>
      module[functionName]({ data: undefined }),
    ),
  )
  return { ...compiled, results }
}

/**
 * A clear compile error rejecting a createServerFn that is not assigned to a
 * top-level variable, matched against the message without its code frame
 * (`compileErrorMessage`).
 */
const misplacedServerFnRejection =
  /createServerFn\b[^]*\b(top[- ]level|module[- ]?(scope|level)|nested|assigned to a (top[- ]level )?variable)/i

/**
 * Every output either rejects the code with a clear createServerFn error
 * (not the internal statement-list crash), or the client neither imports the
 * server-only module nor contains the handler body (`db.inner()`), the SSR
 * caller calls the handler through the provider like for a top-level server
 * fn (no handler body; it may import the server-only module for other server
 * code), and the provider exports and runs every server fn the client
 * reports, the misplaced one included.
 */
async function expectNoClientHandler(code: string) {
  const compiled = {} as Record<Output, string>
  let rejected = false
  for (const output of outputs) {
    try {
      compiled[output] = (await compileCode(output, code)) ?? code
    } catch (error) {
      const message = compileErrorMessage(error)
      expect(message, output).toMatch(misplacedServerFnRejection)
      expect(message, output).not.toMatch(
        /Expected createServerFn declaration in a statement list/,
      )
      rejected = true
    }
  }
  if (rejected) {
    return
  }
  expect(importSources(compiled.client), 'client').not.toContain(serverOnly)
  for (const output of ['client', 'ssr'] as const) {
    expect(compiled[output], output).not.toContain('db.inner()')
  }
  const { results } = await callServerFns(code, {
    stubs: {
      [serverOnly]: { db: { inner: () => 'inner', top: () => 'top' } },
    },
  })
  expect(results).toContain('inner')
}

/**
 * A clear compile error rejecting a server fn builder returned by a function,
 * matched against the message without its code frame (`compileErrorMessage`).
 */
const returnedBuilderRejection =
  /createServerFn\b[^]*\b(returned|returning|returns)\b/i

/**
 * Compiles `code` for the client and calls its `read` export: the client
 * must not import the server-only module, and calling the server-only fn
 * must throw the server-only error.
 */
async function expectServerOnlyRead(code: string) {
  const client = (await compileCode('client', code)) ?? code
  expect(importSources(client)).not.toContain(serverOnly)
  const { read } = await evaluateModule(client, {
    [serverOnly]: { db: { secret: () => 'secret' } },
  })
  expect(settle(() => read())).toBe(serverOnlyError)
}

describe('harness controls', () => {
  test('callServerFns calls a top-level server fn through its provider', async () => {
    const { results } = await callServerFns(
      `${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
      { stubs: { [serverOnly]: { db: { x: () => 'from the server' } } } },
    )
    expect(results).toEqual(['from the server'])
  })

  test('expectNoClientHandler accepts a top-level server fn', async () => {
    await expectNoClientHandler(`${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.inner())`)
  })

  test('an unrelated compile error quoting createServerFn is not a rejection of a misplaced server fn', async () => {
    const error = await compileFor(
      'client',
      `${head}const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`,
    ).catch((caught: unknown) => caught)
    const message = compileErrorMessage(error)
    expect(message).toMatch(/handler\(\) must be called with an expression/)
    expect(message).not.toMatch(misplacedServerFnRejection)
    expect(message).not.toMatch(returnedBuilderRejection)
  })

  test.each([
    {
      name: 'a nested createServerOnlyFn',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return createServerOnlyFn(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a top-level renamed createServerOnlyFn',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const read = serverOnly(() => db.secret())`,
    },
  ])(
    'expectServerOnlyRead accepts $name compiled for the client',
    async ({ code }) => {
      await expectServerOnlyRead(code)
    },
  )

  test('a server fn in a plain .ts module compiles by its id', async () => {
    const { code, serverFns } = await compileFor(
      'client',
      `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
      { id: '/test/src/fns.ts' },
    )
    expect(Object.keys(serverFns)).toHaveLength(1)
    expect(importSources(code!)).not.toContain(serverOnly)
  })
})

describe('server code in the client bundle', () => {
  // Bug: build-mode export lookups are cached per module, but parallel
  // `export *` branches share one visited set, so in a diamond or a cycle a
  // module that re-exports the builder is cached as "not found".
  // Impact: a later importer through that module is left untransformed and
  // ships its handler and server-only imports to the client.
  test.fails.each<{ name: string; reExports: Record<string, string> }>([
    {
      name: 'diamonds',
      reExports: {
        '/test/src/a.ts': `export * from './b'
export * from './c'`,
        '/test/src/b.ts': `export * from './d'`,
        '/test/src/c.ts': `export * from './d'`,
      },
    },
    {
      name: 'cycles',
      reExports: {
        '/test/src/a.ts': `export * from './b'
export * from './d'`,
        '/test/src/b.ts': `export * from './a'`,
      },
    },
  ])(
    'export * $name do not poison the build-mode export cache',
    async ({ reExports }) => {
      // One importer of `base` through each re-exporting module.
      const importers = Object.keys(reExports).map((file) => {
        const name = file.slice('/test/src/'.length, -'.ts'.length)
        return [
          `/test/src/via-${name}.tsx`,
          `import { base } from './${name}'
import { db } from './db.server'
export const via = base.handler(async () => db.${name}())`,
        ] as const
      })
      // One compiler for every importer, like a production build.
      const { compile } = createStartCompiler({
        env: 'client',
        files: {
          '/test/src/d.ts': `${head}export const base = createServerFn()`,
          ...reExports,
        },
      })
      const leaked: Array<string> = []
      for (const [id, code] of importers) {
        if (((await compile(code, id)) ?? code).includes(serverOnly)) {
          leaked.push(id)
        }
      }
      expect(leaked).toEqual([])
    },
  )

  // Bug: middleware and isomorphic fns are detected by the `createMiddleware`
  // / `createIsomorphicFn` text, so a module that only finishes a builder
  // imported from another module is never compiled.
  // Impact: the `.server()` implementation and its server-only imports ship
  // to the client.
  test.fails.each<{
    name: string
    files: Record<string, string>
    code: string
  }>([
    {
      name: 'a middleware builder',
      files: {
        '/test/src/mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const mw = createMiddleware({ type: 'function' })`,
      },
      code: `import { mw } from './mw'
import { db } from './db.server'
export const logged = mw.server(async ({ next }) => { db.log(); return next() })`,
    },
    {
      name: 'an isomorphic builder',
      files: {
        '/test/src/iso.ts': `import { createIsomorphicFn } from '@tanstack/react-start'
export const iso = createIsomorphicFn()`,
      },
      code: `import { iso } from './iso'
import { db } from './db.server'
export const fn = iso.server(() => db.x()).client(() => 'client')`,
    },
  ])(
    'client builds compile $name finished in another module',
    async ({ files, code }) => {
      const client = (await compileCode('client', code, { files })) ?? code
      expect(client).not.toContain(serverOnly)
    },
  )

  // Bug: a server fn builder read as a member of a namespace import
  // (`F.authed.handler`) is not resolved, unlike the same builder imported by
  // name.
  // Impact: the module is left untransformed and ships its handler and
  // server-only imports to the client.
  test.fails(
    'client builds compile a builder read from a namespace import',
    async () => {
      const code = `import * as F from './fns'
import { db } from './db.server'
export const fn = F.authed.handler(async () => db.x())`
      const files = {
        '/test/src/fns.ts': `${head}export const authed = createServerFn({ method: 'POST' })`,
      }
      const client = (await compileCode('client', code, { files })) ?? code
      expect(client).not.toContain(serverOnly)
    },
  )

  // Bug: a namespace of the Start package re-exported by a project module
  // (`export * as Start from '@tanstack/react-start'`) is not resolved.
  // Impact: `Start.createServerFn()` modules are left untransformed and ship
  // their handler and server-only imports to the client.
  test.fails(
    'client builds compile factories of a re-exported Start namespace',
    async () => {
      const code = `import { Start } from './start'
import { db } from './db.server'
export const fn = Start.createServerFn().handler(async () => db.x())`
      const files = {
        '/test/src/start.ts': `export * as Start from '@tanstack/react-start'`,
      }
      const client = (await compileCode('client', code, { files })) ?? code
      expect(client).not.toContain(serverOnly)
    },
  )

  // Bug: the builder of a `.handler()` chain is resolved through identifiers
  // and member expressions only, so a builder returned by a function call
  // (`authed().handler(...)`) is not traced. Rejecting it with a clear
  // compile error is a valid fix.
  // Impact: the module is left untransformed and ships its handler and
  // server-only imports to the client, without an RPC.
  test.fails.each<{
    name: string
    code: string
    files: Record<string, string>
  }>([
    {
      name: 'the same module',
      code: `${head}import { db } from './db.server'
const authed = () => createServerFn({ method: 'POST' })
export const fn = authed().handler(async () => db.x())`,
      files: {},
    },
    {
      name: 'another module',
      code: `import { authed } from './fns'
import { db } from './db.server'
export const fn = authed().handler(async () => db.x())`,
      files: {
        '/test/src/fns.ts': `${head}export const authed = () => createServerFn({ method: 'POST' })`,
      },
    },
  ])(
    'client builds compile a builder returned by a function of $name',
    async ({ code, files }) => {
      const client = await compileCode('client', code, { files }).catch(
        (error: Error) => error,
      )
      if (client instanceof Error) {
        expect(compileErrorMessage(client)).toMatch(returnedBuilderRejection)
        return
      }
      expect(importSources(client ?? code)).not.toContain(serverOnly)
    },
  )

  // Bug: env-only factories nested in other code are found by the factory's
  // exported name (`isNestedDirectCallCandidate`), so a renamed import or a
  // local alias is only compiled as a top-level variable initializer.
  // Impact: the implementation and its server-only imports ship to the
  // client, where calling the server-only fn runs it instead of throwing.
  test.fails.each([
    {
      name: 'a renamed import in a function body',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export function getRead() { return serverOnly(() => db.secret()) }
export const read = () => getRead()()`,
    },
    {
      name: 'a renamed import in an object property',
      code: `import { createServerOnlyFn as serverOnly } from '@tanstack/react-start'
import { db } from './db.server'
export const api = { read: serverOnly(() => db.secret()) }
export const read = () => api.read()`,
    },
    {
      name: 'a local alias in a function body',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
const so = createServerOnlyFn
export function getRead() { return so(() => db.secret()) }
export const read = () => getRead()()`,
    },
  ])(
    'client: a createServerOnlyFn called through $name is compiled',
    async ({ code }) => {
      await expectServerOnlyRead(code)
    },
  )

  // Bug: a call whose result is immediately member-called (`f().bind()`) is
  // recorded as the inner call of a method chain and never visited as a
  // candidate itself. Same root cause as the `renderServerComponent(...).then()`
  // pin in react-start-rsc/tests/rscCssTransform.test.tsx.
  // Impact: the implementation and its server-only imports ship to the
  // client, where calling the server-only fn runs it instead of throwing.
  test.fails(
    'client: a createServerOnlyFn whose result is member-called is compiled',
    async () => {
      await expectServerOnlyRead(`import { createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const read = createServerOnlyFn(() => db.secret()).bind(null)`)
    },
  )

  // Bug: when createServerFn is the only factory imported, the compiler only
  // visits top-level variable declarations, so a server fn anywhere else is
  // neither extracted nor rejected. Rejecting it with a clear compile error
  // is a valid fix.
  // Impact: its handler and server-only imports ship to the client.
  test.fails.each([
    {
      name: 'a function body',
      code: `export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    },
    {
      name: 'a function body next to a top-level server fn',
      code: `export const top = createServerFn().handler(async () => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    },
    {
      name: 'a switch case',
      code: `export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const inner = createServerFn().handler(async () => db.inner())
      return inner
  }
}`,
    },
    {
      name: 'a top-level block',
      code: `export const registry: Array<unknown> = []
{
  const inner = createServerFn().handler(async () => db.inner())
  registry.push(inner)
}`,
    },
    {
      name: 'an object property',
      code: `export const api = { read: createServerFn().handler(async () => db.inner()) }`,
    },
    {
      name: 'a class field',
      code: `export class Api { read = createServerFn().handler(async () => db.inner()) }`,
    },
    {
      name: 'an anonymous default export',
      code: `export default createServerFn().handler(async () => db.inner())`,
    },
    {
      name: 'an assignment',
      code: `export let fn
fn = createServerFn().handler(async () => db.inner())`,
    },
  ])(
    'a createServerFn in $name does not ship its handler to the client',
    async ({ code }) => {
      await expectNoClientHandler(
        `${head}import { db } from './db.server'\n${code}`,
      )
    },
  )

  // Bug: with another factory imported, a server fn nested in a function is
  // extracted on the client, but its provider module exports a handler it
  // never declares.
  // Impact: the server build fails.
  test.fails(
    'a createServerFn nested in a function next to another factory yields a valid provider',
    async () => {
      await expectNoClientHandler(`import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const serverOnly = createServerOnlyFn(() => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`)
    },
  )

  // Bug: Start factories are matched by name without scope analysis, so a
  // parameter shadowing the imported factory or namespace is compiled as the
  // factory.
  // Impact: the client replaces the local call with the server-only stub,
  // which throws.
  test.fails.each([
    {
      name: 'a parenthesized namespace receiver',
      code: `import * as Start from '@tanstack/react-start'
export function make(Start) {
  return (Start).createServerOnlyFn(() => 'local')
}`,
      local: { createServerOnlyFn: (fn: () => string) => fn },
    },
    {
      name: 'a factory name',
      code: `import { createServerOnlyFn } from '@tanstack/react-start'
export function make(createServerOnlyFn) {
  return createServerOnlyFn(() => 'local')
}`,
      local: (fn: () => string) => fn,
    },
  ])(
    'client: a parameter shadowing $name is left alone',
    async ({ code, local }) => {
      const client = (await compileCode('client', code)) ?? code
      const { make } = await evaluateModule(client)
      expect(settle(() => make(local)())).toBe('local')
    },
  )
})

describe('server function handlers', () => {
  // Bug: generated imports and handler names are not made unique against
  // user bindings, so a user binding named like one of them collides with it.
  // Impact: the module fails to build.
  test.fails.each([
    'createClientRpc',
    'createSsrRpc',
    'createServerRpc',
    'fn_createServerFn_handler',
  ])(
    'a user binding named %s does not collide with generated code',
    async (binding) => {
      const { results } =
        await callServerFns(`${head}const ${binding} = (value: unknown) => value
export const used = ${binding}('user')
export const fn = createServerFn().handler(async () => 'from the server')`)
      expect(results).toEqual(['from the server'])
    },
  )

  // Bug: the provider calls each server fn from a generated wrapper,
  // `opts => fn.__executeServer(opts)`, whose `opts` parameter shadows a
  // server fn named `opts`.
  // Impact: every call of a server fn named `opts` fails on the server.
  test.fails('a server fn named opts runs on the server', async () => {
    const { results } = await callServerFns(
      `${head}export const opts = createServerFn().handler(async () => 'from the server')`,
    )
    expect(results).toEqual(['from the server'])
  })

  // Bug: when the handler passed to `.handler()` is a `createServerOnlyFn()`
  // call, the inner call is compiled first and the caller is never rewritten
  // into an RPC.
  // Impact: the server fn cannot be called (the client caller throws the
  // server-only error, the SSR caller is a bare id).
  test.fails.each(['client', 'ssr'] as const)(
    '%s: a createServerOnlyFn handler still produces an RPC caller',
    async (output) => {
      const code = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(createServerOnlyFn(async () => db.x()))`
      const module = await evaluateModule(
        (await compileCode(output, code)) ?? code,
        { './db.server': { db: {} } },
      )
      expect(module.fn).toEqual({ rpc: { [output]: expect.any(String) } })
    },
  )

  // Bug: the provider module (`?tss-serverfn-split`) keeps the `'use client'`
  // directive of its source module.
  // Impact: in RSC builds every export of the provider becomes a client
  // reference, so a server fn declared in a `'use client'` file cannot run.
  test.fails(
    "the provider of a 'use client' module is not a client module",
    async () => {
      const { provider, results } = await callServerFns(
        `'use client'
${head}import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())`,
        {
          // What react-start's Rsbuild RSC configuration passes.
          directives: ['use server-entry'],
          stubs: { './db.server': { db: { x: () => 'from the server' } } },
        },
      )
      expect(results).toEqual(['from the server'])
      expect(directivePrologue(provider)).not.toContain('use client')
    },
  )
})

describe('dead-code elimination', () => {
  // Bug: removing the other environment's implementation of an env function
  // declared in a hook leaves the locals only that implementation read
  // unreferenced, and dead-code elimination (babel-dead-code-elimination,
  // which removes newly unreferenced bindings) deletes their declarators,
  // hook calls included.
  // Impact: the hooks after it run in a different order on the server and
  // the client (`useId` mismatches, hydration errors).
  test.fails.each([
    {
      output: 'client' as const,
      code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const serverId = useId()
  const describe = createIsomorphicFn().server(() => serverId).client(() => 'client')
  const inputId = useId()
  return [describe(), inputId]
}`,
    },
    {
      output: 'ssr' as const,
      code: `import { createClientOnlyFn } from '@tanstack/react-start'
import { useId } from 'react'
export function useField() {
  const clientId = useId()
  const describe = createClientOnlyFn(() => clientId)
  const inputId = useId()
  return [describe, inputId]
}`,
    },
  ])(
    '$output: hook calls read only by the removed implementation still run',
    async ({ output, code }) => {
      const calls: Array<string> = []
      const { useField } = await evaluateModule(
        (await compileCode(output, code)) ?? code,
        { react: { useId: () => calls.push('useId') } },
      )
      useField()
      expect(calls).toHaveLength(2)
    },
  )

  const pragmaModule = `/** @jsx h */
import { h } from './jsx'
import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => h('p', null))
export const Card = () => <div />`
  const pragmaStubs = { './jsx': { h: (type: string) => `h(${type})` } }

  // Control for the JSX pragma pin below (same harness).
  test('evaluateModule renders JSX through the factory of a classic JSX pragma', async () => {
    const { Card } = await evaluateModule(pragmaModule, pragmaStubs)
    expect(Card()).toBe('h(div)')
  })

  // Bug: dead-code elimination does not count a classic JSX pragma
  // (`/** @jsx h */`) as a use of the factory it names, so the factory import
  // is removed when no other code reads it (the generated imports also land
  // above the pragma comment, where Oxc no longer reads it). Same root cause
  // as the JSX pragma pins in known-bugs-hydrate.test.ts and
  // router-plugin/tests/known-bugs-code-splitter.test.ts.
  // Impact: the module's components throw "h is not defined" or render
  // through another JSX factory than the one the module selects.
  test.fails(
    'client: the factory of a classic JSX pragma stays imported',
    async () => {
      const client = (await compileCode('client', pragmaModule)) ?? pragmaModule
      const { Card } = await evaluateModule(client, pragmaStubs)
      expect(settle(() => Card())).toBe('h(div)')
    },
  )
})

describe('Vue single-file components', () => {
  // Bug: the parser is chosen from the module id without its query, so the
  // `<script setup lang="ts">` block of a Vue SFC, which @vitejs/plugin-vue
  // serves in builds as `Page.vue?vue&type=script&setup=true&lang.ts`, is
  // parsed as TSX.
  // Impact: TypeScript-only syntax such as a `<string>value` assertion fails
  // the build.
  test.fails(
    'a <script setup lang="ts"> block is parsed as TypeScript',
    async () => {
      const { code, serverFns } = await compileFor(
        'client',
        `${head}import { db } from './db.server'
const input = <string>(globalThis as any).input
export const fn = createServerFn().handler(async () => db.x(input))`,
        { id: '/test/src/Page.vue?vue&type=script&setup=true&lang.ts' },
      )
      expect(Object.keys(serverFns)).toHaveLength(1)
      expect(importSources(code!)).not.toContain(serverOnly)
    },
  )
})

describe('CommonJS dependencies', () => {
  // Bug: a module matching a detection pattern (`.handler(`) is parsed as strict ESM.
  // Impact: a sloppy-mode CommonJS dependency with such text fails the build.
  test.fails.each([
    {
      name: 'a legacy octal escape',
      id: '/test/node_modules/lib/index.cjs',
      code: `var reset = '\\033[0m'
module.exports = function (app) {
  return app.handler(reset)
}`,
    },
    {
      name: 'a with statement',
      id: '/test/node_modules/lib/index.cjs',
      code: `with (Math) {
  exports.run = function (app) {
    return app.handler(PI)
  }
}`,
    },
    {
      name: 'a top-level return',
      id: '/test/node_modules/lib/index.js',
      code: `if (typeof window === 'undefined') return
exports.run = function (app) {
  return app.handler(1)
}`,
    },
  ])(
    'a CommonJS dependency with $name is left untouched',
    async ({ id, code }) => {
      for (const env of ['client', 'server'] as const) {
        const { compile } = createStartCompiler({ env })
        expect((await compile(code, id)) ?? code).toBe(code)
      }
    },
  )
})
