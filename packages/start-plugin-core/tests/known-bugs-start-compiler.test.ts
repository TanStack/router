/**
 * Known Start compiler bugs. Each test asserts correct behaviour for a bug on
 * main and is marked .fails; remove .fails when the bug is fixed.
 */
import { describe, expect, test } from 'vitest'
import {
  compileAll,
  compileCode,
  createStartCompiler,
  evaluateModule,
  outputs,
  settle,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { ModuleStub } from './regression-helpers'

const head = `import { createServerFn } from '@tanstack/react-start'\n`

/** Server-only module that must never reach the client bundle. */
const serverOnly = './db.server'

/**
 * Every output either rejects the code with a createServerFn error or is a
 * valid module, and the handler body (`db.inner()`) is not in the client.
 */
async function expectNoClientHandler(code: string) {
  for (const output of outputs) {
    let compiled: string
    try {
      compiled = (await compileCode(output, code)) ?? code
    } catch (error) {
      expect((error as Error).message, output).toMatch(/createServerFn/)
      continue
    }
    expect(await getModuleErrors(compiled), output).toEqual([])
    if (output === 'client') {
      expect(compiled).not.toContain('db.inner()')
    }
  }
}

/**
 * Calls every server fn the client build reports through the provider
 * export it names, like the server-function router.
 */
async function callServerFns(
  code: string,
  options: {
    directives?: Array<string>
    stubs?: Record<string, ModuleStub>
  } = {},
) {
  const { provider, serverFns } = await compileAll(code, options)
  const module = await evaluateModule(provider, options.stubs)
  const results = await Promise.all(
    Object.values(serverFns).map(({ functionName }) =>
      module[functionName]({ data: undefined }),
    ),
  )
  return { provider, results }
}

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
  // Bug: generated names are not made unique against user bindings: a user
  // binding named like a generated import or handler collides with it, and
  // the `opts` parameter of the provider's wrapper shadows a server fn named
  // `opts`.
  // Impact: the module fails to build, or every call of the `opts` server fn
  // fails on the server.
  test.fails.each([
    {
      name: 'a server fn named opts',
      code: `${head}export const opts = createServerFn().handler(async () => 'from the server')`,
    },
    ...[
      'createClientRpc',
      'createSsrRpc',
      'createServerRpc',
      'fn_createServerFn_handler',
    ].map((binding) => ({
      name: `a user binding named ${binding}`,
      code: `${head}const ${binding} = (value: unknown) => value
export const used = ${binding}('user')
export const fn = createServerFn().handler(async () => 'from the server')`,
    })),
  ])('$name does not collide with generated code', async ({ code }) => {
    expect((await callServerFns(code)).results).toEqual(['from the server'])
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
  // Source: Next.js server actions transform fixtures server-graph/3 and
  // server-graph/4
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
      expect(provider).not.toMatch(/['"]use client['"]/)
    },
  )
})

describe('dead-code elimination', () => {
  // Bug: removing the other environment's implementation of an env function
  // declared in a hook also removes the hook calls initializing locals that
  // only that implementation read.
  // Impact: the hooks after it run in a different order on the server and
  // the client (`useId` mismatches, hydration errors).
  // Source: babel-dead-code-elimination "only eliminates newly unreferenced
  // identifiers"
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
})

describe('CommonJS dependencies', () => {
  // Bug: the compiler parses every module whose text matches a detection
  // pattern (such as `.handler(`) as a strict ES module, so sloppy-mode
  // CommonJS throws a SyntaxError although it has no Start import. The
  // bundler plugins must keep compiling `node_modules` (Start libraries), so
  // this is the compiler's contract.
  // Impact: a CommonJS dependency with such code and text like `app.handler(`
  // fails the build.
  // Source: @vitejs/plugin-rsc cjs.test.ts (CommonJS modules are sloppy-mode
  // scripts)
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
        await expect(compile(code, id)).resolves.toBeNull()
      }
    },
  )
})
