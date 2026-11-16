/**
 * Where a server fn that is not a top-level declarator's value may be written
 * (SPEC J4.6, R162): where its expression is evaluated exactly once,
 * unconditionally, when the module loads (an object or array literal entry, a
 * call or `new` argument, `export default`, an assignment's right-hand side,
 * a class static field or static block, through parentheses, casts and the
 * last operand of a sequence), it works like a top-level one, created where
 * its statement runs. Anywhere else (a condition, a loop, a block, a
 * function body) the build fails at the server fn. Observed through the
 * public Start host: what each environment serves or rejects, and calls of
 * the server fns from the client (by id, through Start's server entry) and
 * from server code.
 */
import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callServerFnThroughCallers,
  compileError,
  serveCase,
  useStartHost,
} from '../regression-helpers'
import { expectCompileError } from '../diagnostics'

const host = useStartHost()

const head = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
`
const files = {
  'db.server.ts': `export const db = { inner: () => 'inner' }\n`,
}
/** A server fn whose handler reads the server-only module. */
const fn = `createServerFn().handler(async () => db.inner())`

describe('a server fn created once when its module loads', () => {
  const positions = [
    {
      name: 'an object literal entry',
      code: `export const api = { foo: ${fn} }`,
      read: 'module.api.foo',
    },
    {
      name: 'an array literal entry',
      code: `export const fns = [${fn}]`,
      read: 'module.fns[0]',
    },
    {
      name: 'a call argument',
      code: `const wrap = <T,>(f: T) => f\nexport const wrapped = wrap(${fn})`,
      read: 'module.wrapped',
    },
    {
      name: 'a new argument',
      code: `class Box<T> {\n  constructor(readonly value: T) {}\n}\nexport const box = new Box(${fn})`,
      read: 'module.box.value',
    },
    {
      name: 'export default',
      code: `export default ${fn}`,
      read: 'module.default',
    },
    {
      name: 'the right-hand side of a member assignment',
      code: `export const api: Record<string, unknown> = {}\napi.foo = ${fn}`,
      read: 'module.api.foo',
    },
    {
      name: 'the right-hand side of an assignment of a let',
      code: `export let assigned: unknown\nassigned = ${fn}`,
      read: 'module.assigned',
    },
    {
      name: 'a class static field',
      code: `export class Api {\n  static foo = ${fn}\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'a class static block',
      code: `export class Api {\n  static foo: unknown\n  static {\n    Api.foo = ${fn}\n  }\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'parentheses, casts and a non-null assertion',
      code: `export const api = { foo: ((${fn}) as any)!, bar: ${fn} satisfies unknown }`,
      read: 'module.api.foo',
    },
    {
      name: 'the last operand of a sequence',
      code: `export const api = { foo: (0, ${fn}) }`,
      read: 'module.api.foo',
    },
  ]

  test.each(positions)(
    'works in $name: the client gets an RPC, the server runs the handler',
    async ({ code, read }) => {
      const served = await serveCase(await host(), {
        'module.tsx': `${head}${code}`,
        ...files,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      expect(await callServerFnThroughCallers(served, read)).toBe('inner')
    },
  )

  // d22 (inventory-serverfn-shapes): the server fn is created where its
  // statement runs, after the statements before it, so a middleware list
  // they fill is complete when `.middleware()` copies it
  test('is created after the statements before its own', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}import { seen } from './mw'
const list: Array<typeof seen> = []
const fill = (l: Array<unknown>) => {
  l.push(seen)
}
fill(list)
export const api = {
  foo: createServerFn()
    .middleware(list)
    .handler(async ({ context }) => (context as { seen?: string }).seen ?? 'none'),
}`,
      'mw.ts': `import { createMiddleware } from '@tanstack/react-start'
export const seen = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { seen: 'middleware' } }),
)
`,
      ...files,
    })
    expect(await callServerFnThroughCallers(served, 'module.api.foo')).toBe(
      'middleware',
    )
  })

  // b13: a bare statement creates a server fn nothing names; the module
  // still builds and loads in every environment
  test('builds as a bare statement', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `${head}${fn}\nexport const other = ${fn}`,
      ...files,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.other')).toBe(
      'inner',
    )
  })
})

describe('a server fn not created exactly once when its module loads', () => {
  const declarations = `export const api: Record<string, unknown> = {}
const flag = Math.random() >= 0
const reg = { add: <T,>(f: T) => f }
`
  const refused = [
    { name: 'an if branch', code: `if (flag) {\n  api.a = ${fn}\n}` },
    {
      name: 'an else branch',
      code: `if (!flag) {\n} else {\n  api.a = ${fn}\n}`,
    },
    { name: 'a ternary', code: `export const t = flag ? ${fn} : null` },
    { name: 'a && operand', code: `export const t = flag && ${fn}` },
    { name: 'a || operand', code: `export const t = !flag || ${fn}` },
    { name: 'a ?? operand', code: `export const t = api.x ?? ${fn}` },
    { name: 'an optional call', code: `export const t = reg?.add(${fn})` },
    {
      name: 'a for loop',
      code: `for (const k of ['a']) {\n  api[k] = ${fn}\n}`,
    },
    {
      name: 'a while loop',
      code: `let i = 0\nwhile (i++ < 1) {\n  api.w = ${fn}\n}`,
    },
    { name: 'a try block', code: `try {\n  api.t = ${fn}\n} catch {}` },
    {
      name: 'a switch case',
      code: `switch (typeof api) {\n  case 'object':\n    api.s = ${fn}\n}`,
    },
    { name: 'a block', code: `{\n  api.b = ${fn}\n}` },
    {
      name: 'a function body',
      code: `export function make() {\n  return ${fn}\n}`,
    },
    { name: 'an arrow function body', code: `export const make = () => ${fn}` },
    {
      name: 'an immediately invoked function',
      code: `export const t = (() => ${fn})()`,
    },
    {
      name: 'a class instance field',
      code: `export class Api {\n  foo = ${fn}\n}`,
    },
  ]

  test.each(refused)(
    'is a compile error at the server fn in every environment: $name',
    async ({ code }) => {
      const source = `${head}${declarations}${code}`
      const startCase = await (
        await host()
      ).case({ 'module.tsx': source, ...files })
      for (const environment of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, environment)
        expect(failure, `${environment} serves the module`).toBeDefined()
        expectCompileError(failure, {
          source,
          at: 'createServerFn().handler(async () => db.inner())',
          column: true,
        })
      }
    },
  )

  // d19: a private name of the class can't leave it: a static server fn
  // whose code reads one is a compile error at the name
  test('is a compile error when it reads a private name of its class', async () => {
    const source = `${head}export class Api {
  static #key = 'k'
  static foo = createServerFn().handler(async () => db.inner() + Api.#key)
}`
    const startCase = await (
      await host()
    ).case({ 'module.tsx': source, ...files })
    for (const environment of ['client', 'ssr'] as const) {
      const failure = await compileError(startCase, environment)
      expect(failure, `${environment} serves the module`).toBeDefined()
      expectCompileError(failure, { source, at: '#key)', column: true })
    }
  })
})
