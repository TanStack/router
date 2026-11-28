/**
 * Where a server fn that is not a top-level declarator's value may be written
 * (SPEC J4.6, R162): where its expression is evaluated exactly once,
 * unconditionally, when the module loads (an object or array literal entry, a
 * call or `new` argument, `export default`, an assignment's right-hand side,
 * a class static field or static block, through parentheses, casts and any
 * operand of a sequence), it works like a top-level one, created where its
 * statement runs. Anywhere else (a condition, a loop, a block, a
 * function body) the build fails at the server fn. Observed through the
 * public Start host: what each environment serves or rejects, and calls of
 * the server fns from the client (by id, through Start's server entry) and
 * from server code.
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import { closeAfterAll } from '../file-end'
import {
  callFromClient,
  callServerFnThroughCallers,
  compileError,
  createStartHost,
  inPage,
  serveCase,
} from '../regression-helpers'
import { expectCompileError } from '../diagnostics'
import type { StartHost } from '../start-host'

let host: StartHost
const openHost = closeAfterAll()
beforeAll(async () => {
  host = await openHost(() => createStartHost())
}, 60_000)

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
    {
      name: 'an operand of a sequence before the last',
      code: `const all: Array<unknown> = []\nexport const seq = (all.push(${fn}), all)`,
      read: 'module.seq[0]',
    },
    {
      name: 'the object of a member expression',
      code: `export const bound = ${fn}.bind(null)`,
      read: 'module.bound',
    },
    {
      name: 'a tagged template substitution',
      code: `const tag = (_: TemplateStringsArray, f: unknown) => f\nexport const tagged = tag\`\${${fn}}\``,
      read: 'module.tagged',
    },
    {
      name: 'a spread element',
      code: `export const spread = [...[${fn}]]`,
      read: 'module.spread[0]',
    },
    {
      name: 'a spread argument',
      code: `const first = (...fs: Array<unknown>) => fs[0]\nexport const spreadArg = first(...[${fn}])`,
      read: 'module.spreadArg',
    },
    {
      name: 'the operand of a top-level await',
      code: `export const awaited = [await ${fn}][0]`,
      read: 'module.awaited',
    },
    {
      name: 'a JSX attribute value',
      code: `export const el = <div data-fn={${fn}} />`,
      read: "module.el.props['data-fn']",
    },
    {
      name: 'a JSX child',
      code: `export const kids = <>{${fn}}</>`,
      read: 'module.kids.props.children',
    },
    {
      name: "a ternary's test",
      code: `const picked: Array<unknown> = []\nexport const tested = (picked.push(${fn}), picked)[0] ? picked : null`,
      read: 'module.tested[0]',
    },
    {
      name: 'the left operand of a logical operator',
      code: `export const left = ${fn} || null`,
      read: 'module.left',
    },
    // a decorator runs once, with its class (TypeScript's decorators, as an
    // app's tsconfig turns them on)
    {
      name: 'a decorator argument',
      code: `const decorated: Array<unknown> = []\nconst dec = (f: unknown) => (c: unknown) => (decorated.push(f), c)\n@dec(${fn})\nclass Decorated {}\nexport { Decorated, decorated }`,
      read: 'module.decorated[0]',
      files: {
        'tsconfig.json': JSON.stringify({
          compilerOptions: { experimentalDecorators: true },
        }),
      },
    },
    {
      name: 'a labeled statement',
      code: `export const api: Record<string, unknown> = {}\nlabeled: api.foo = ${fn}`,
      read: 'module.api.foo',
    },
    // what the chain reads in a function of its own runs when that function
    // is called, after the module loaded: a declaration of a later statement
    // or of its own (F3, review-phase3)
    {
      name: 'a chain reading a later declaration in a function of its own',
      code: `export const api = {\n  foo: createServerFn()\n    .validator((d: unknown) => check(d))\n    .handler(async () => db.inner()),\n}\nconst check = (d: unknown) => d`,
      read: 'module.api.foo',
    },
    {
      name: 'a static field reading its own class in a function of its own',
      code: `export class Api {\n  static check = (d: unknown) => d\n  static foo = createServerFn()\n    .validator((d: unknown) => Api.check(d))\n    .handler(async () => db.inner())\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'options reading a top-level await',
      code: `export const api = {\n  foo: createServerFn({ method: await Promise.resolve('POST' as const) }).handler(\n    async () => db.inner(),\n  ),\n}`,
      read: 'module.api.foo',
    },
    // what the chain takes from around it is the language's: a property
    // or key named `arguments`, `this` in a type only, a function's own
    // `this` and `arguments`, an async arrow's own `await`, an inner class's
    // own private name (S4, S6, S11 of the hotspot 5 design)
    {
      name: 'a static field reading a member named arguments',
      code: `export class Api {\n  static arguments = 1\n  static foo = createServerFn().handler(async () => (Api.arguments ? db.inner() : 'none'))\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'a static field whose handler returns a key named arguments',
      code: `export class Api {\n  static foo = createServerFn().handler(async () => ({ arguments: db.inner() }).arguments)\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'a static field naming `this` in a type only',
      code: `export class Api {\n  static x = 'x'\n  static foo = createServerFn().handler(async () => db.inner() as typeof this.x)\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'a static field whose function handler reads its own `this` and `arguments`',
      code: `export class Api {\n  static foo = createServerFn().handler(async function () {\n    return typeof this === 'object' && arguments.length > 0 ? db.inner() : 'none'\n  })\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'a static field whose async arrow awaits',
      code: `export class Api {\n  static foo = createServerFn().handler(async () => await Promise.resolve(db.inner()))\n}`,
      read: 'module.Api.foo',
    },
    {
      name: "a static field reading an inner class's own private name",
      code: `export class Api {\n  static foo = createServerFn().handler(async () => new (class {\n    #y = db.inner()\n    m() {\n      return this.#y\n    }\n  })().m())\n}`,
      read: 'module.Api.foo',
    },
  ]

  test.each<{
    name: string
    code: string
    read: string
    files?: Record<string, string>
  }>(positions)(
    'works in $name: the client gets an RPC, the server runs the handler',
    async ({ code, read, files: own }) => {
      const served = await serveCase(host, {
        'module.tsx': `${head}${code}`,
        ...files,
        ...own,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      expect(await callServerFnThroughCallers(served, read)).toBe('inner')
    },
  )

  // where the value is no server fn: an operator's operand, a template's
  // expression, a computed key (each creates the server fn once, when the
  // module loads); the module builds and gives the source's value
  const valued = [
    {
      name: 'the operand of a unary operator',
      code: `export const value = typeof ${fn}`,
      expected: 'function',
    },
    {
      name: 'an operand of a binary operator',
      code: `export const value = ${fn} !== null`,
      expected: true,
    },
    {
      name: 'a template literal expression',
      code: `export const value = \`\${typeof ${fn}}\``,
      expected: 'function',
    },
    {
      name: 'a computed key of an object literal',
      code: `export const value = Object.keys({ [typeof ${fn}]: 1 })[0]`,
      expected: 'function',
    },
    {
      name: 'a computed key of a class member',
      code: `class K {\n  static [typeof ${fn}] = 1\n}\nexport const value = Object.keys(K)[0]`,
      expected: 'function',
    },
    {
      name: 'an enum member',
      code: `enum E {\n  A = typeof ${fn} === 'function' ? 1 : 0,\n}\nexport const value = E.A`,
      expected: 1,
    },
  ]

  test.each(valued)(
    'builds in $name, with the value of the source',
    async ({ code, expected }) => {
      const served = await serveCase(host, {
        'module.tsx': `${head}${code}`,
        ...files,
      })
      expectNotLoaded(await served.loads(), ['./db.server'])
      expect(await inPage(served, 'return module.value')).toEqual(expected)
      expect((await served.ssr()).value).toEqual(expected)
    },
  )

  // a callee or a tag calls the server fn when the module loads: compiled
  // only (both environments serve the module, the client without the handler)
  test.each([
    {
      name: "a call's callee",
      code: `export const p = ${fn}({ data: undefined })`,
    },
    { name: "a tagged template's tag", code: `export const p = ${fn}\`x\`` },
  ])('compiles in $name, the client without the handler', async ({ code }) => {
    const startCase = await host.case({
      'module.tsx': `${head}${code}`,
      ...files,
    })
    for (const environment of ['client', 'ssr'] as const) {
      expect(
        await compileError(startCase, environment),
        environment,
      ).toBeUndefined()
    }
    expect(await startCase.served('module.tsx', 'client')).not.toContain(
      'db.inner',
    )
  })

  // F2 (review-phase3): an operand a sequence discards is evaluated once
  // too: compiled like any other position, its handler off the client
  test.each([
    {
      name: 'an operand of a sequence its statement discards',
      code: `const other = () => 1\nexport const value = (${fn}, other())`,
    },
    {
      name: 'an operand of a bare sequence statement',
      code: `const other = () => 1\n${fn}, other()\nexport const value = other()`,
    },
  ])('compiles as $name, the client without the handler', async ({ code }) => {
    const served = await serveCase(host, {
      'module.tsx': `${head}${code}`,
      ...files,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(served.code.client).not.toContain('db.inner')
    expect((await served.ssr()).value).toBe(1)
  })

  // d22 (inventory-serverfn-shapes): the server fn is created where its
  // statement runs, after the statements before it, so a middleware list
  // they fill is complete when `.middleware()` copies it
  test('is created after the statements before its own', async () => {
    const served = await serveCase(host, {
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

  // F1 (review-phase3): also when the chain reads only imports, a call's
  // result or a global, the server fn is created where its statement runs,
  // after the statements before it (the hoisted `const` stays in the module)
  const middlewares = `import { createMiddleware } from '@tanstack/react-start'
const seen = createMiddleware({ type: 'function' }).server(({ next }) =>
  next({ context: { seen: 'middleware' } }),
)
export const list: Array<typeof seen> = []
export const fill = () => {
  list.push(seen)
}
export const getMws = () => [...list]
`
  const seenHandler = `.handler(async ({ context }) => (context as { seen?: string }).seen ?? 'none')`
  test.each([
    {
      name: 'an imported list an earlier statement fills',
      code: `import { list, fill } from './mws'\nfill()\nexport const api = { foo: createServerFn().middleware(list)${seenHandler} }`,
      read: 'module.api.foo',
    },
    {
      name: 'an imported list an earlier statement fills, in a static field',
      code: `import { list, fill } from './mws'\nfill()\nexport class Api {\n  static foo = createServerFn().middleware(list)${seenHandler}\n}`,
      read: 'module.Api.foo',
    },
    {
      name: 'an imported call made after an earlier statement',
      code: `import { fill, getMws } from './mws'\nfill()\nexport const api = { foo: createServerFn().middleware(getMws())${seenHandler} }`,
      read: 'module.api.foo',
    },
  ])(
    'is created after the statements before its own when it reads $name',
    async ({ code, read }) => {
      const served = await serveCase(host, {
        'module.tsx': `${head}${code}`,
        'mws.ts': middlewares,
        ...files,
      })
      expect(await callServerFnThroughCallers(served, read)).toBe('middleware')
    },
  )

  test('is created after the statement setting a global its options read', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${head};(globalThis as any).fnOptions = { method: 'POST' }
export const api = {
  foo: createServerFn((globalThis as any).fnOptions).handler(async () => db.inner()),
}`,
      ...files,
    })
    expect((await served.ssr()).api.foo.method).toBe('POST')
    expect(await callServerFnThroughCallers(served, 'module.api.foo')).toBe(
      'inner',
    )
  })

  // a binding a later statement declares, read when the module loads, has
  // the same value above the server fn's statement as in it: a function
  // declaration is initialised before any statement runs, a `var` is
  // `undefined` until its declarator runs
  test('reads a function declared below when the module loads, with the value of the source', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${head}export const api = {
  foo: createServerFn()
    .validator(check)
    .handler(async ({ data }) => \`checked \${data}\`),
}
function check(value: unknown) {
  return \`\${String(value)}!\`
}`,
      ...files,
    })
    expect(
      await callServerFnThroughCallers(served, 'module.api.foo', 'x'),
    ).toBe('checked x!')
  })

  test('reads a var declared below when the module loads, undefined as in the source', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${head}export const api = {
  foo: createServerFn({ method: later ?? 'POST' }).handler(async () => db.inner()),
}
var later: 'GET' | undefined = 'GET'`,
      ...files,
    })
    expect((await served.ssr()).api.foo.method).toBe('POST')
    expect(await callServerFnThroughCallers(served, 'module.api.foo')).toBe(
      'inner',
    )
  })

  // b13: a bare statement creates a server fn nothing names; the module
  // still builds and loads in every environment
  test('builds as a bare statement', async () => {
    const served = await serveCase(host, {
      'module.tsx': `${head}${fn}\nexport const other = ${fn}`,
      ...files,
    })
    expectNotLoaded(await served.loads(), ['./db.server'])
    expect(await callServerFnThroughCallers(served, 'module.other')).toBe(
      'inner',
    )
  })
})

// SPEC J4.2: a server fn defined in code the server erases and the client
// runs (`<ClientOnly>` children at the module top level) still answers the
// client.
test('a server fn in <ClientOnly> children at the module top level answers the client', async () => {
  const served = await serveCase(host, {
    'module.tsx': `${head}import { ClientOnly } from '@tanstack/react-router'
export const el = <ClientOnly fallback={null}><b data-fn={${fn}} /></ClientOnly>`,
    ...files,
  })
  expectNotLoaded(await served.loads(), ['./db.server'])
  expect(
    await callFromClient(served, "module.el.props.children.props['data-fn']"),
  ).toBe('inner')
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
    {
      name: 'a getter body',
      code: `export const o = {\n  get foo() {\n    return ${fn}\n  },\n}`,
    },
    {
      name: 'a class method body',
      code: `export class Api {\n  static make() {\n    return ${fn}\n  }\n}`,
    },
    {
      name: 'a default parameter value',
      code: `export const make = (f = ${fn}) => f`,
    },
    {
      name: 'a destructuring default',
      code: `export const { d = ${fn} } = api as { d?: unknown }`,
    },
    {
      name: 'a member access after ?.',
      code: `export const t = reg?.add.call(null, ${fn})`,
    },
    {
      name: 'a logical assignment',
      code: `api.x ??= ${fn}`,
    },
    {
      name: 'a namespace body',
      code: `export namespace N {\n  export const f = ${fn}\n}`,
    },
  ]

  test.each(refused)(
    'is a compile error at the server fn in every environment: $name',
    async ({ code }) => {
      const source = `${head}${declarations}${code}`
      const startCase = await host.case({ 'module.tsx': source, ...files })
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

  // a name only the code around the server fn sees (a class static block's
  // local, a class expression's own name), and a binding its hoisted
  // `const` would read, when the module loads, before it has the value the
  // source reads (a `let`, `const` or class its own statement or a later one
  // declares, a `var` its own statement declared before the server fn): a
  // compile error at the name
  test.each([
    {
      name: "a class static block's local",
      code: `export class Api {\n  static foo: unknown\n  static {\n    const m = 'POST' as const\n    Api.foo = createServerFn({ method: m }).handler(async () => db.inner())\n  }\n}`,
      at: 'm }',
    },
    {
      name: "a class expression's own name",
      code: `export const B = class A {\n  static k = 'k'\n  static foo = createServerFn().handler(async () => db.inner() + A.k)\n}`,
      at: 'A.k)',
    },
    // the class's `this`, `super`, `new.target`, read in code of the chain
    // that is no function of its own: a nested class's computed key or
    // `extends`, a JSX member tag (S1, S2, S10 of the hotspot 5 design)
    {
      name: "`this` of the class in a nested class's computed key",
      code: `export class Api {\n  static k = 'k'\n  static foo = createServerFn().handler(async () => new (class {\n    [this.k]() {}\n  })())\n}`,
      at: 'this.k',
    },
    {
      name: "`this` of the class in a nested class's extends",
      code: `export class Api {\n  static B = class {}\n  static foo = createServerFn().handler(async () => new (class extends this.B {})())\n}`,
      at: 'this.B',
    },
    {
      name: '`this` of the class as a JSX member tag',
      code: `export class Api {\n  static P = () => null\n  static foo = createServerFn().handler(async () => <this.P />)\n}`,
      at: 'this.P',
    },
    {
      name: '`super` of the class',
      code: `class Base {\n  static x = 1\n}\nexport class Api extends Base {\n  static foo = createServerFn().handler(async () => super.x)\n}`,
      at: 'super.x',
    },
    {
      name: '`new.target` of the class',
      code: `export class Api {\n  static foo = createServerFn().handler(async () => new.target)\n}`,
      at: 'new.target',
    },
    {
      name: '`this` of the class it is written in',
      code: `export class Api {\n  static mws: Array<never> = []\n  static foo = createServerFn().middleware(this.mws).handler(async () => db.inner())\n}`,
      at: 'this.mws',
    },
    {
      name: 'a declaration of its own statement, when the module loads',
      code: `export const mws: Array<never> = [],\n  o = { foo: createServerFn().middleware(mws).handler(async () => db.inner()) }`,
      at: 'mws).',
    },
    {
      name: 'its own class, when the module loads',
      code: `export class Api {\n  static mws: Array<never> = []\n  static foo = createServerFn().middleware(Api.mws).handler(async () => db.inner())\n}`,
      at: 'Api.mws',
    },
    // a function called in place runs when the module loads (S8), and so
    // may an instance field's initialiser, of a class constructed while it
    // is defined (S10)
    {
      name: 'a declaration of its own statement, in a function called in place',
      code: `export const v = (d: unknown) => d,\n  o = { foo: createServerFn().validator((() => v)()).handler(async () => db.inner()) }`,
      at: 'v)())',
    },
    // a generator called in place runs its parameters at the call, and a
    // parameter's decorator when its class is defined (Astra and Gemini
    // reviews of the hotspot 5 implementation)
    {
      name: 'a declaration of its own statement, in a default parameter of a generator called in place',
      code: `export const v = (d: unknown) => d,\n  o = { foo: createServerFn().validator((function* (f = v) { yield f })().next().value!).handler(async () => db.inner()) }`,
      at: 'v) { yield',
    },
    {
      name: "a later declaration, in a decorator of a class's constructor parameter",
      code: `const dec = (_v: unknown) => (..._args: Array<unknown>) => {}\nexport const api = { foo: createServerFn().validator(((class C {\n    constructor(@dec(later) public b: string) {}\n  }), (d: unknown) => d)).handler(async () => db.inner()) }\nconst later = 1`,
      at: 'later) public',
    },
    {
      name: 'a declaration of its own statement, in an instance field of a class constructed while it is defined',
      code: `export const earlier = (d: unknown) => d,\n  o = { foo: createServerFn().validator((class V {\n    field = earlier\n    static validate = new V().field\n  }).validate).handler(async () => db.inner()) }`,
      at: 'earlier\n    static',
    },
    {
      name: 'a `const` a later statement declares, when the module loads',
      code: `export const api = { foo: createServerFn().validator(check).handler(async () => db.inner()) }\nconst check = (d: unknown) => d`,
      at: 'check).',
    },
    {
      name: 'a class a later statement declares, when the module loads',
      code: `export const api = { foo: createServerFn().validator(Check.run).handler(async () => db.inner()) }\nclass Check {\n  static run = (d: unknown) => d\n}`,
      at: 'Check.run',
    },
    {
      name: 'a `var` its own statement declared before the server fn, when the module loads',
      code: `export var mws: Array<never> = [],\n  o = { foo: createServerFn().middleware(mws).handler(async () => db.inner()) }`,
      at: 'mws).',
    },
  ])('is a compile error when it reads $name', async ({ code, at }) => {
    const source = `${head}${code}`
    const startCase = await host.case({ 'module.tsx': source, ...files })
    for (const environment of ['client', 'ssr'] as const) {
      const failure = await compileError(startCase, environment)
      expect(failure, `${environment} serves the module`).toBeDefined()
      expectCompileError(failure, { source, at, column: true })
    }
  })

  // d19: a private name of the class can't leave it: a static server fn
  // whose code reads one is a compile error at the name
  // (also `#key in o`, and from a nested class declaring a private name of
  // its own: S3 of the hotspot 5 design)
  test.each([
    {
      name: 'a member',
      code: `export class Api {\n  static #key = 'k'\n  static foo = createServerFn().handler(async () => db.inner() + Api.#key)\n}`,
      at: '#key)',
    },
    {
      name: 'an in check',
      code: `export class Api {\n  static #key = 'k'\n  static foo = createServerFn().handler(async () => #key in Api)\n}`,
      at: '#key in',
    },
    {
      name: 'a member, in a nested class with a private name of its own',
      code: `export class Api {\n  static #key = 'k'\n  static foo = createServerFn().handler(async () => new (class {\n    #own = 1\n    m() {\n      return Api.#key + this.#own\n    }\n  })().m())\n}`,
      at: '#key +',
    },
  ])(
    'is a compile error when it reads a private name of its class: $name',
    async ({ code, at }) => {
      const source = `${head}${code}`
      const startCase = await host.case({ 'module.tsx': source, ...files })
      for (const environment of ['client', 'ssr'] as const) {
        const failure = await compileError(startCase, environment)
        expect(failure, `${environment} serves the module`).toBeDefined()
        expectCompileError(failure, { source, at, column: true })
      }
    },
  )

  // in a function, a key named `arguments` is no use of the function's:
  // the general refusal, at the server fn (S5 of the hotspot 5 design)
  test('is a compile error at the server fn in a function when its handler returns a key named arguments', async () => {
    const source = `${head}export function make() {\n  return createServerFn().handler(async () => ({ arguments: 1 }))\n}`
    const startCase = await host.case({ 'module.tsx': source, ...files })
    for (const environment of ['client', 'ssr'] as const) {
      const failure = await compileError(startCase, environment)
      expect(failure, `${environment} serves the module`).toBeDefined()
      expectCompileError(failure, {
        source,
        at: 'createServerFn().handler(async () => ({',
        column: true,
      })
    }
  })
})
