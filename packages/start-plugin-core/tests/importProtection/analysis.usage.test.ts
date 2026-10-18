import { describe, expect, test } from 'vitest'
import { findPostCompileUsagePos } from '../../src/import-protection/analysis'
import { locationOf, usageLocation } from './usage-location'

function pos(code: string, source: string) {
  return findPostCompileUsagePos(code, source)
}

describe('findPostCompileUsagePos', () => {
  test('returns undefined when there is no import from the source', () => {
    expect(pos(`const x = 1`, 'denied')).toBeUndefined()
  })

  test('reports UTF-16 columns after astral characters, tabs and CRLF line endings', () => {
    const code =
      "import { secret } from 'denied'\r\n" +
      '// 👨‍👩‍👧 𝒳𝒴 日本語\r\n' +
      "\tconst label = '🎉'; const value = secret()\r\n"
    expect(pos(code, 'denied')).toEqual({
      line: 3,
      column0: "\tconst label = '🎉'; const value = ".length,
    })
  })

  // A lone CR is a line terminator in JavaScript, like LF and CRLF, so the
  // same source reports the same position with each. Source: the #8504
  // probe (R-11, lone CR).
  test.each(['\n', '\r\n', '\r'])(
    'reports the same line and column with %j line endings',
    (newline) => {
      const code = [
        "import { secret } from 'denied'",
        '// a comment',
        'export const value = secret()',
        '',
      ].join(newline)
      expect(pos(code, 'denied')).toEqual({
        line: 3,
        column0: 'export const value = '.length,
      })
    },
  )

  test('returns undefined when import is type-only', () => {
    expect(
      pos(`import type { Foo } from 'denied';\nconst x = 1`, 'denied'),
    ).toBeUndefined()
  })

  test('finds preferred call usage for named import', () => {
    const p = pos(
      `import { getRequest } from 'denied';\nexport function x(){ return getRequest() }`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('falls back to non-binding identifier usage if no preferred usage exists', () => {
    const p = pos(`import { x } from 'denied';\nconst y = x;`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('ignores binding positions (variable declarator id)', () => {
    const p = pos(
      `import { x } from 'denied';\n{ const x = 1;\nconst y = x; }`,
      'denied',
    )
    expect(p).toBeUndefined()
  })

  test('ignores object property key (non-shorthand) but still finds later usage', () => {
    const p = pos(
      `import { x } from 'denied';\nconst obj = { x: 1 };\nx()`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('ignores shadowed identifiers in nested function scope', () => {
    const p = pos(
      `import { x } from 'denied';\nfunction inner(x: any){ return x }\nconst y = x;`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('ignores shadowing via catch clause param', () => {
    const p = pos(
      `import { err } from 'denied';\ntry { throw 1 } catch (err) { console.log(err) }\nconsole.log(err)`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(3)
  })

  test('handles namespace member preferred usage (ns.foo)', () => {
    const p = pos(`import * as ns from 'denied';\nns.getRequest()`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('handles default import preferred usage (call)', () => {
    const p = pos(`import req from 'denied';\nreq()`, 'denied')
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('counts object pattern shorthand as usage (not a binding position)', () => {
    const p = pos(
      `import { foo } from 'denied';\nconst obj = { foo };`,
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(2)
  })

  test('var in block scope shadows import at function level', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    var x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeUndefined()
  })

  test('var in block scope does NOT shadow import in outer scope', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    var x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
        `console.log(x);`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(8)
  })

  test('let in block scope does NOT shadow import in enclosing function', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  if (true) {`,
        `    let x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })

  test('const in block scope does NOT shadow import in enclosing function', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `function f() {`,
        `  {`,
        `    const x = 1;`,
        `  }`,
        `  return x;`,
        `}`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })

  test('var in nested arrow function does not shadow outer scope', () => {
    const p = pos(
      [
        `import { x } from 'denied';`,
        `const outer = () => {`,
        `  const inner = () => {`,
        `    var x = 1;`,
        `  };`,
        `  return x;`,
        `};`,
      ].join('\n'),
      'denied',
    )
    expect(p).toBeDefined()
    expect(p!.line).toBe(6)
  })

  test('finds a parenthesized call usage', () => {
    expect(
      pos(`import { denied } from 'denied';\n(denied)()`, 'denied'),
    ).toEqual({ line: 2, column0: 1 })
  })

  // Line 2 does not use the import (it shadows or merely names `x`, or does
  // not mention it); the use of the import is on line 3.
  test.each([
    ['a for-in on an identifier', `let k; for (k in {}) { console.log(k) }`],
    ['a for without clauses', `for (;;) { break }`],
    ['a for without a test', `for (let i = 0; ; i++) { break }`],
    ['a for without an update', `for (let i = 0; i < 1; ) { break }`],
    ['array holes', `function f() { const [, a] = [1, 2]; return a }`],
    ['an object pattern parameter', `function a({ x }) { return x }`],
    ['an object rest parameter', `function a({ ...x }) { return x }`],
    ['an array pattern parameter', `function a([, x]) { return x }`],
    ['a default parameter', `function a(x = 1) { return x }`],
    ['a rest parameter', `function a(...x) { return x }`],
    ['a block class', `function a(ok) { if (ok) { class x {} return x } }`],
    [
      'a block function',
      `function a(ok) { if (ok) { function x() {} return x } }`,
    ],
    ['a named function expression', `const g = function x() { return x }`],
    ['a class expression name', `const C = class x { static y = 1 }`],
    ['a for-let', `for (let x = 0; x < 1; x++) { console.log(x) }`],
    ['a for-of', `for (const x of [1]) { console.log(x) }`],
    ['an object key', `const o = { x: 1 }`],
  ])('skips %s', (_name, line2) => {
    const code = `import { x } from 'denied'\n${line2}\nexport const later = x`
    expect(pos(code, 'denied')?.line).toBe(3)
  })

  test('a var of a nested function does not shadow the enclosing function', () => {
    const code = `import { x } from 'denied'
function a() { function b() { var x = 1 } return x }
export const later = x`
    expect(pos(code, 'denied')?.line).toBe(2)
  })

  // Line 2 uses the import inside a loop or a catch clause.
  test.each([
    ['a for initialiser', `for (let i = x(); i < 1; i++) {}`],
    ['a for test', `for (let i = 0; x(i); i++) {}`],
    ['a for update', `for (let i = 0; i < 1; i = x(i)) {}`],
    ['a for body', `for (let i = 0; i < 1; i++) { x() }`],
    ['a for-of right side', `for (const i of x()) {}`],
    ['a for-of body', `for (const i of [1]) { x() }`],
    ['a catch body', `try {} catch { x() }`],
  ])('finds a use in %s', (_name, line2) => {
    const code = `import { x } from 'denied'\n${line2}\nexport const later = x`
    expect(pos(code, 'denied')?.line).toBe(2)
  })

  // Any real use of the import is a correct place to report (a call, `new`
  // or a namespace member read may be preferred, but need not be).
  test.each([
    ['a call after a read', `export const first = x\nx()`, [2, 3]],
    ['a call after a call argument', `foo(x)\nx()`, [2, 3]],
    ['`new` after a read', `export const first = x\nnew x()`, [2, 3]],
    ['a call after a `new` argument', `new Map(x)\nx()`, [2, 3]],
    [
      'the first read before a computed key',
      `export const first = x\nobj[x]`,
      [2, 3],
    ],
    ['an object value', `export const o = { a: x }`, [2]],
    ['a re-export', `export { x }`, [2]],
    ['an aliased re-export', `export { x as leaked }`, [2]],
  ])('reports %s', (_name, rest, lines) => {
    expect(lines).toContain(
      pos(`import { x } from 'denied'\n${rest}`, 'denied')?.line,
    )
  })

  test('reports a namespace member read after a read of the namespace', () => {
    expect([2, 3]).toContain(
      pos(
        `import * as ns from 'denied'\nexport const first = ns\nns.read`,
        'denied',
      )?.line,
    )
  })
})

// The violation import protection reports for a denied import in a module the
// Start compiler compiled: none when every use is inside code the compiler
// removes from the environment (a safe boundary), so that the compiled module
// no longer imports it, else one at the use that leaks.
describe('usage location after the Start compiler', () => {
  const imports = `import { createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn, createMiddleware } from '@tanstack/react-start'
import { denied } from 'denied'
`

  test.each([
    {
      name: 'createServerFn().handler',
      output: 'client',
      body: `export const fn = createServerFn().handler(async () => denied())`,
    },
    {
      name: 'a parenthesized createServerFn().handler argument',
      output: 'client',
      body: `export const fn = createServerFn().handler((() => denied()))`,
    },
    {
      name: 'a wrapped createServerFn().handler argument',
      output: 'client',
      body: `const withAuth = <T,>(fn: T) => fn
export const fn = createServerFn().handler(withAuth(async () => denied()))`,
    },
    {
      name: 'a createServerFn().handler argument with a type assertion',
      output: 'client',
      body: `export const fn = createServerFn().handler((async () => denied()) as any)`,
    },
    {
      name: 'createServerFn().handler through a namespace import',
      output: 'client',
      body: `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerFn().handler(() => denied())`,
    },
    {
      name: 'createServerOnlyFn through a namespace import',
      output: 'client',
      body: `import * as Start from '@tanstack/react-start'
export const fn = Start.createServerOnlyFn(() => denied())`,
    },
    {
      name: 'a handler after a validator',
      output: 'client',
      body: `export const fn = createServerFn({ method: 'GET' }).validator((d: unknown) => d).handler(() => denied())`,
    },
    {
      name: 'createServerOnlyFn',
      output: 'client',
      body: `export const fn = createServerOnlyFn(() => denied())`,
    },
    {
      name: 'createMiddleware().server',
      output: 'client',
      body: `export const middleware = createMiddleware({ type: 'function' }).server(({ next }) => {
  const secret = denied()
  return next({ context: { secret } })
})`,
    },
    {
      name: 'createIsomorphicFn().server',
      output: 'client',
      body: `export const fn = createIsomorphicFn().server(() => denied())`,
    },
    {
      name: 'createClientOnlyFn',
      output: 'ssr',
      body: `export const fn = createClientOnlyFn(() => denied())`,
    },
    {
      name: 'a createClientOnlyFn argument with a satisfies clause',
      output: 'ssr',
      body: `export const fn = createClientOnlyFn((() => denied()) satisfies () => unknown)`,
    },
    {
      name: 'a parenthesized createIsomorphicFn().client argument',
      output: 'ssr',
      body: `export const fn = createIsomorphicFn().client((() => denied()))`,
    },
  ] as const)(
    '$output: no violation is reported for a use inside $name',
    async ({ output, body }) => {
      expect(await usageLocation(imports + body, output)).toBeUndefined()
    },
  )

  test.each([
    {
      name: 'a server fn handler in the provider',
      output: 'provider',
      body: `export const fn = createServerFn().handler(async () => denied())`,
    },
  ] as const)(
    '$output: a use inside $name is reported',
    async ({ output, body }) => {
      const code = imports + body
      expect(await usageLocation(code, output)).toEqual(
        locationOf(code, 3, 'denied()'),
      )
    },
  )

  test('client: a use after a server fn handler is reported', async () => {
    const code = `${imports}export const fn = createServerFn().handler(async () => {
  return denied()
})
export function leakyReference() {
  return denied()
}`
    expect(await usageLocation(code, 'client')).toEqual(
      locationOf(code, 7, 'denied()'),
    )
  })
})
