/**
 * Edge cases ported from Waku's `allowServer` transform tests (wakujs/waku,
 * MIT): packages/waku/tests/vite-plugin-allow-server.test.ts. That transform
 * keeps the code one environment needs and replaces the rest with throwing
 * stubs, which is what the Start compiler does for env-only functions,
 * isomorphic functions, middleware and server functions. Each test names the
 * Waku test whose scenario it translates.
 */
import { describe, expect, test } from 'vitest'
import {
  clientOnlyError as clientOnly,
  compileAll,
  compileCode,
  frameworks,
  importModule,
  importSources,
  outputs,
  serverOnlyError as serverOnly,
  settle,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { Output } from './regression-helpers'

describe('ported Waku allowServer transform tests', () => {
  // "skips files without a use client directive even if the string exists",
  // "does not require allowServer to come from waku/client" (inverted: Start
  // only compiles the factories it can resolve to a Start package)
  test.each([
    {
      name: 'only mentions the factories in strings and comments',
      code: `// createServerFn, createServerOnlyFn and createIsomorphicFn are not used here
export const label = 'createServerFn().handler(async () => 1)'
export const other = \`createClientOnlyFn(\${label})\``,
    },
    {
      name: 'calls .handler() on an object that is not a server fn',
      code: `import { api } from './api'
import { secret } from './secret.server'
export const route = api.handler(async () => secret())`,
    },
    {
      name: 'imports a same-named factory from another module',
      code: `import { createServerOnlyFn } from './my-utils'
export const value = createServerOnlyFn(() => 'mine')`,
    },
    {
      name: 'declares a same-named factory',
      code: `function createServerOnlyFn<T>(fn: T) {
  return fn
}
export const value = createServerOnlyFn(() => 'mine')`,
    },
  ])('a module that $name is left untouched', async ({ code }) => {
    for (const output of outputs) {
      expect(await compileCode(output, code), output).toBeNull()
    }
  })

  // "throws when allowServer receives an unexpected number of arguments",
  // "throws when allowServer receives zero arguments"
  test.each([
    {
      code: `export const none = createServerOnlyFn()`,
      error: 'createServerOnlyFn() must be called with a function!',
      rejectedBy: ['ssr', 'provider'],
    },
    {
      code: `export const none = createClientOnlyFn()`,
      error: 'createClientOnlyFn() must be called with a function!',
      rejectedBy: ['client'],
    },
    {
      code: `export const none = createIsomorphicFn().server().client(() => 1)`,
      error:
        'createIsomorphicFn().server(func) must be called with a function!',
      rejectedBy: ['ssr', 'provider'],
    },
  ])(
    'a factory called without a function is rejected where it runs: $code',
    async ({ code, error, rejectedBy }) => {
      const rejected: Array<Output> = []
      for (const output of outputs) {
        try {
          await compileCode(
            output,
            `import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'\n${code}`,
          )
        } catch (thrown) {
          expect((thrown as Error).message).toContain(error)
          rejected.push(output)
        }
      }
      expect(rejected).toEqual(rejectedBy)
    },
  )

  describe.each(frameworks)('%s', (framework) => {
    // "keeps only allowServer dependencies and removes allowServer imports",
    // "handles multiple allowServer exports with shared dependencies",
    // "removes unused allowServer import when never invoked"
    test('stripped implementations drop their own dependencies and keep shared ones', async () => {
      const compiled = await compileAll(
        `import { createServerOnlyFn, createClientOnlyFn } from '@tanstack/${framework}-start'
import { helper } from './helper.client'
import { shared } from './shared.server'
const base = 1
function timesTwo(x: number) {
  return x * 2 + base
}
function getValue(x: number) {
  return helper(timesTwo(x) + base)
}
const unused = 123
export const allowed = createClientOnlyFn(() => getValue(unused))
export const serverOnly = createServerOnlyFn(() => shared(base))
export const extra = 'client'`,
        { framework },
      )
      expect(importSources(compiled.client)).toEqual(['./helper.client'])
      expect(compiled.client).not.toMatch(/\bshared\b/)
      for (const output of ['ssr', 'provider'] as const) {
        expect(importSources(compiled[output])).toEqual(['./shared.server'])
        expect(compiled[output]).not.toMatch(/\b(?:helper|timesTwo|getValue)\b/)
      }
      for (const output of outputs) {
        expect(compiled[output]).not.toMatch(
          /\bcreate(?:Server|Client)OnlyFn\b(?!\(\) functions)/,
        )
      }
      const modules = {
        './helper.client': `export const helper = (x) => 'helper:' + x`,
        './shared.server': `export const shared = (x) => 'shared:' + x`,
      }
      const client = await importModule(compiled.client, modules)
      expect([
        client.allowed(),
        settle(client.serverOnly),
        client.extra,
      ]).toEqual(['helper:248', serverOnly, 'client'])
      const ssr = await importModule(compiled.ssr, modules)
      expect([settle(ssr.allowed), ssr.serverOnly(), ssr.extra]).toEqual([
        clientOnly,
        'shared:1',
        'client',
      ])
    })

    // "supports allowServer aliasing and export specifiers", "stubs bare
    // named exports even when backing value uses allowServer"
    test('aliased factories exported through specifiers', async () => {
      const compiled = await compileAll(
        `import { createServerOnlyFn as allow, createClientOnlyFn as browser } from '@tanstack/${framework}-start'
import { db } from './db.server'
const value = 42
const aliasSource = () => db.x() + value
const result = allow(aliasSource)
const viewer = browser(() => value)
export { result as exposed, viewer }`,
        { framework },
      )
      expect(importSources(compiled.client)).toEqual([])
      expect(importSources(compiled.ssr)).toEqual(['./db.server'])
      const modules = { './db.server': `export const db = { x: () => 1 }` }
      const client = await importModule(compiled.client, modules)
      expect([settle(client.exposed), client.viewer()]).toEqual([
        serverOnly,
        42,
      ])
      const ssr = await importModule(compiled.ssr, modules)
      expect([ssr.exposed(), settle(ssr.viewer)]).toEqual([43, clientOnly])
    })

    // "handles default allowServer export", "stubs default exports while
    // preserving allowServer dependencies"
    test.each([
      {
        code: `import { db } from './db.server'
export default createServerOnlyFn(() => db.x())`,
        client: serverOnly,
        server: 'db',
        clientImports: [],
      },
      {
        code: `import { chart } from './chart.client'
export default createClientOnlyFn(() => chart())`,
        client: 'chart',
        server: clientOnly,
        clientImports: ['./chart.client'],
      },
      {
        code: `import { db } from './db.server'
import { chart } from './chart.client'
export default createIsomorphicFn().server(() => db.x()).client(() => chart())`,
        client: 'chart',
        server: 'db',
        clientImports: ['./chart.client'],
      },
    ])(
      'a default-exported env-specific function: $code',
      async ({ code, client, server, clientImports }) => {
        const compiled = await compileAll(
          `import { createServerOnlyFn, createClientOnlyFn, createIsomorphicFn } from '@tanstack/${framework}-start'\n${code}`,
          { framework },
        )
        expect(importSources(compiled.client)).toEqual(clientImports)
        expect(importSources(compiled.ssr)).not.toContain('./chart.client')
        const modules = {
          './db.server': `export const db = { x: () => 'db' }`,
          './chart.client': `export const chart = () => 'chart'`,
        }
        expect(
          settle((await importModule(compiled.client, modules)).default),
        ).toBe(client)
        expect(
          settle((await importModule(compiled.ssr, modules)).default),
        ).toBe(server)
      },
    )
  })

  // "handles default allowServer export" (middleware variant)
  test('a default-exported middleware loses its server implementation on the client', async () => {
    const code = `import { createMiddleware } from '@tanstack/react-start'
import { db } from './db.server'
export default createMiddleware().server(async ({ next }) => {
  db.log()
  return next()
})`
    const client = await compileCode('client', code)
    expect(client).not.toBeNull()
    expect(await getModuleErrors(client!)).toEqual([])
    expect(importSources(client!)).toEqual([])
    expect(client).toMatch(/export default createMiddleware\(\);/)
  })

  // "removes re-exports and stubs them while keeping allowServer deps"
  test('re-exports next to env-only functions and server fns stay in the callers', async () => {
    const compiled =
      await compileAll(`import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { db } from './db.server'
export { helper } from './helper'
export * from './other'
export * as ns from './ns'
export const ok = createServerOnlyFn(() => db.x())
export const fn = createServerFn().handler(async () => db.y())`)
    expect(importSources(compiled.client)).toEqual([
      './helper',
      './ns',
      './other',
    ])
    expect(importSources(compiled.ssr)).toEqual([
      './db.server',
      './helper',
      './ns',
      './other',
    ])
  })

  // "transforms client modules and stubs non-allowServer exports"
  test('stripping a client-only function keeps the React code beside it', async () => {
    const compiled =
      await compileAll(`import { createClientOnlyFn } from '@tanstack/react-start'
import { Component, createContext, useContext, memo } from 'react'
import { atom } from 'jotai/vanilla'
const initialCount = 1
const MyContext = createContext(0)
export const useMyContext = () => useContext(MyContext)
const MyProvider = memo(MyContext.Provider)
export const makeAtom = createClientOnlyFn(() => atom(initialCount))
export class MyComponent extends Component {
  render() {
    return <MyProvider value={initialCount}>x</MyProvider>
  }
}`)
    expect(importSources(compiled.client)).toEqual(['jotai/vanilla', 'react'])
    for (const output of ['ssr', 'provider'] as const) {
      expect(importSources(compiled[output])).toEqual(['react'])
      expect(compiled[output]).toMatch(/\bconst initialCount = 1\b/)
      expect(compiled[output]).toMatch(/\bMyProvider = memo\(/)
    }
  })

  // "transforms with trailing comment without new lines"
  test.each([
    { name: 'a line comment', end: '\n// some comment' },
    { name: 'a block comment', end: '\n/* some comment */' },
    {
      name: 'a source map comment',
      end: '\n//# sourceMappingURL=module.js.map',
    },
    { name: 'a CRLF line comment', end: '\r\n// some comment' },
  ])('a module ending in $name without a newline', async ({ end }) => {
    const code = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
export const read = createServerOnlyFn(() => 'server')
export const fn = createServerFn().handler(async () => 'handler')${end}`
    const compiled = await compileAll(code)
    expect(settle((await importModule(compiled.client)).read)).toBe(serverOnly)
    expect((await importModule(compiled.ssr)).read()).toBe('server')
    const provider = await importModule(compiled.provider)
    expect(Object.keys(provider)).toEqual(['fn_createServerFn_handler'])
    expect(await provider.fn_createServerFn_handler({})).toBe('handler')

    const dev = await compileCode('provider', code, { mode: 'dev' })
    expect(dev).not.toBeNull()
    expect(await getModuleErrors(dev!)).toEqual([])
    expect(dev).toMatch(/^if \(import\.meta\.hot\)/m)
    expect(dev).toMatch(/^export \{ fn_createServerFn_handler \};?$/m)
  })
})
