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
      name: 'an immediately invoked createServerFn().handler argument',
      output: 'client',
      body: `export const fn = createServerFn().handler((() => denied())())`,
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
      name: 'a parenthesized createServerFn callee',
      output: 'client',
      body: `export const fn = (createServerFn)().handler(() => denied())`,
    },
    {
      name: 'a handler after a validator',
      output: 'client',
      body: `export const fn = createServerFn({ method: 'GET' }).validator((d: unknown) => d).handler(() => denied())`,
    },
    {
      name: 'the handler of a server fn builder variable',
      output: 'client',
      body: `const myServerFn = createServerFn({ method: 'GET' })
export const fn = myServerFn.handler(() => denied())`,
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
      name: 'the server of a middleware variable',
      output: 'client',
      body: `const authMiddleware = createMiddleware()
export const middleware = authMiddleware.server(() => denied())`,
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
      name: 'a parenthesized createClientOnlyFn callee and argument',
      output: 'ssr',
      body: `export const fn = (createClientOnlyFn)((() => denied()))`,
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
      name: 'createIsomorphicFn().client',
      output: 'client',
      body: `export const fn = createIsomorphicFn().client(() => denied())`,
    },
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

  // A value named like a server fn builder (`*ServerFn`) is not one: the
  // client keeps its `handler` callback and the use inside it.
  test('client: a use inside the handler method of an object named like a server fn is reported', async () => {
    const code = `${imports}const myServerFn = { handler: (fn: () => unknown) => fn() }
export const fn = myServerFn.handler(() => denied())`
    expect(await usageLocation(code, 'client')).toEqual(
      locationOf(code, 4, 'denied()'),
    )
  })
})
