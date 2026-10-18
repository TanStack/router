/**
 * Controls of the module validator (validate-module.ts): it rejects a module
 * a runtime could not load or that would throw a ReferenceError, and accepts
 * every way a module legitimately declares, imports or probes a name.
 */
import { describe, expect, test } from 'vitest'
import { declaredNames, getModuleErrors } from '../src/validate-module'

describe('getModuleErrors', () => {
  /** A factory pragma that does not lead the module. */
  const nonLeadingPragma = `import { h } from 'preact'
/** @jsx h */
export const Page = () => <div>{h('i', null)}</div>`

  test('rejects syntax errors and duplicate bindings', async () => {
    expect(await getModuleErrors('export const = 1')).not.toEqual([])
    expect(
      await getModuleErrors(`import { a } from './a'
const a = 1
export { a }`),
    ).not.toEqual([])
  })

  test('rejects a reference to a name that is neither declared nor imported', async () => {
    expect(
      await getModuleErrors(`export const read = () => helper()
export const Page = () => <Missing />`),
    ).toEqual([
      '`helper` is referenced but never declared or imported',
      '`Missing` is referenced but never declared or imported',
    ])
  })

  test('rejects a classic JSX pragma whose factory is not imported', async () => {
    expect(
      await getModuleErrors(`/** @jsxRuntime classic */
/** @jsx jsx */
export const Page = () => <div />`),
    ).toEqual(['`jsx` is referenced but never declared or imported'])
  })

  // In a project whose JSX runtime is classic, Oxc compiles JSX with the
  // factory and fragment of the `@jsx`/`@jsxFrag` pragmas that lead the
  // module, and with `React.createElement` otherwise: those names must exist.
  test.each([
    {
      name: '`@jsx` alone, factory declared',
      code: `/** @jsx h */
const h = (type, props, ...children) => ({ type, props, children })
export const Page = () => <div />`,
      errors: [],
    },
    {
      name: '`@jsx` and `@jsxFrag`, both imported',
      code: `/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from 'preact'
export const Page = () => <><div /></>`,
      errors: [],
    },
    {
      name: '`@jsx` alone, factory missing',
      code: `/** @jsx h */
export const Page = () => <div />`,
      errors: ['`h` is referenced but never declared or imported'],
    },
    {
      name: '`@jsx` and `@jsxFrag`, fragment missing',
      code: `/** @jsx h @jsxFrag Fragment */
import { h } from 'preact'
export const Page = () => <><div /></>`,
      errors: ['`Fragment` is referenced but never declared or imported'],
    },
    {
      name: '`@jsxFrag` alone (classic default factory), fragment missing',
      code: `// @jsxFrag Fragment
import React from 'react'
export const Page = () => <><div /></>`,
      errors: ['`Fragment` is referenced but never declared or imported'],
    },
    {
      // Oxc only reads the pragmas that lead the module: below an import, the
      // project's default factory applies.
      name: '`@jsx` below an import, default factory missing',
      code: nonLeadingPragma,
      errors: ['`React` is referenced but never declared or imported'],
    },
  ])(
    'checks a module of a classic project: $name',
    async ({ code, errors }) => {
      expect(
        await getModuleErrors(code, 'module.tsx', {
          jsx: { runtime: 'classic' },
        }),
      ).toEqual(errors)
    },
  )

  // The same modules in a project whose JSX runtime is automatic (the
  // default): Oxc ignores a factory pragma there, and the automatic runtime
  // imports its own factories.
  test.each([
    {
      name: '`@jsx` alone',
      code: `/** @jsx h */\nexport const Page = () => <div />`,
    },
    { name: '`@jsx` below an import', code: nonLeadingPragma },
  ])(
    'accepts the factory pragma of a module of an automatic project: $name',
    async ({ code }) => {
      expect(await getModuleErrors(code)).toEqual([])
      expect(
        await getModuleErrors(code, 'module.tsx', {
          jsx: { runtime: 'automatic' },
        }),
      ).toEqual([])
    },
  )

  test('a classic project with its own factory reads that factory', async () => {
    const code = `export const Page = () => <><div /></>`
    expect(
      await getModuleErrors(code, 'module.tsx', {
        jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
      }),
    ).toEqual([
      '`h` is referenced but never declared or imported',
      '`Fragment` is referenced but never declared or imported',
    ])
  })

  // The automatic runtime imports its factories: nothing to declare. A
  // factory pragma does not apply to it (`@jsxRuntime automatic`), and
  // `@jsxImportSource` selects it.
  test.each([
    {
      name: 'no pragma',
      code: `export const Page = () => <><div /></>`,
    },
    {
      name: '`@jsxRuntime automatic` next to `@jsx`',
      code: `/** @jsxRuntime automatic */
/** @jsx h @jsxFrag Fragment */
export const Page = () => <><div /></>`,
    },
    {
      name: '`@jsxImportSource` next to `@jsx`',
      code: `/** @jsxImportSource preact */
/** @jsx h */
export const Page = () => <><div /></>`,
    },
  ])('accepts an automatic runtime module: $name', async ({ code }) => {
    expect(await getModuleErrors(code)).toEqual([])
  })

  test('accepts declared, hoisted, imported, probed and global names', async () => {
    expect(
      await getModuleErrors(`import { imported } from './lib'
label: for (const item of [1]) { if (item) break label }
export function read({ param = imported }, ...rest) {
  try { hoisted() } catch (error) { return [error, param, rest, arguments] }
  var later = 1
  class Local { static value = Local.name; method() { return this } }
  return [later, Local, { key: 1 }.key, typeof probed !== 'undefined' && probed, window, console]
}
function hoisted() {}
export const Page = () => <div>{imported}</div>`),
    ).toEqual([])
  })

  // A `typeof` check protects only the reads it guards: the code it selects
  // when the name exists. Every other read of the name still throws a
  // ReferenceError when the name does not exist.
  test.each([
    {
      name: 'the right side of `&&`',
      code: `export const read = () => typeof missing !== 'undefined' && missing.value`,
    },
    {
      name: 'the consequent of `?:`',
      code: `export const read = () => typeof missing === 'function' ? missing() : null`,
    },
    {
      name: 'the body of `if`',
      code: `export function read() {
  if (typeof missing !== 'undefined') {
    const inner = () => missing.value
    return inner()
  }
  return null
}`,
    },
    {
      name: 'the `else` branch of a check that the name does not exist',
      code: `export function read() {
  if (typeof missing === 'undefined') {
    return null
  } else {
    return missing
  }
}`,
    },
    {
      name: 'the right side of `||` after a check that the name does not exist',
      code: `export const read = () => typeof missing === 'undefined' || missing.value`,
    },
    {
      name: 'a check with the operands swapped',
      code: `export const read = () => 'undefined' != typeof missing && missing`,
    },
    {
      name: 'the minified check',
      code: `export const read = () => typeof missing < 'u' && missing`,
    },
    {
      name: 'the minified check last in a comma sequence',
      code: `export function read() {
  if ((console.log('read'), 'u' > typeof missing)) {
    return missing
  }
}`,
    },
    {
      name: 'a check combined with another one',
      code: `export const read = () =>
  typeof window !== 'undefined' && typeof missing !== 'undefined' ? missing : null`,
    },
    {
      name: 'the statements after an early return',
      code: `export function read() {
  if (typeof missing === 'undefined' || typeof missing.value !== 'string') return
  try {
    return missing.value
  } catch {}
}`,
    },
    {
      // The shape of React DOM's use of the Navigation API.
      name: 'a function only the guarded branch passes on',
      code: `export function subscribe() {
  function onTimeout() {
    return missing.value
  }
  function onEvent() {
    setTimeout(onTimeout, 20)
  }
  if (typeof missing === 'object') {
    missing.addEventListener('event', onEvent)
    setTimeout(onTimeout, 100)
  }
}`,
    },
  ])(
    'accepts a read of a free name a typeof check guards: $name',
    async ({ code }) => {
      expect(await getModuleErrors(code)).toEqual([])
    },
  )

  test.each([
    {
      name: 'in another function than the check',
      code: `export const isDefined = () => typeof missing !== 'undefined'
export const read = () => missing.value`,
    },
    {
      name: 'next to a guarded read in another function',
      code: `export const guarded = () => typeof missing !== 'undefined' && missing
export const read = () => missing.value`,
    },
    {
      name: 'before the check',
      code: `export function read() {
  const value = missing
  return typeof missing !== 'undefined' ? value : null
}`,
    },
    {
      name: 'on the side the check selects when the name does not exist',
      code: `export const read = () => typeof missing !== 'undefined' || missing`,
    },
    {
      name: 'in the alternate of `?:`',
      code: `export const read = () => typeof missing === 'function' ? null : missing`,
    },
    {
      name: 'in a function code outside the guarded branch also calls',
      code: `export function subscribe() {
  function onTimeout() {
    return missing.value
  }
  if (typeof missing === 'object') {
    setTimeout(onTimeout, 100)
  }
  return onTimeout
}`,
    },
    {
      name: 'in an exported function the guarded branch calls',
      code: `export function onTimeout() {
  return missing.value
}
export function subscribe() {
  if (typeof missing === 'object') {
    setTimeout(onTimeout, 100)
  }
}`,
    },
    {
      name: 'after an early return that does not always return',
      code: `export function read(flag) {
  if (typeof missing === 'undefined') {
    if (flag) return null
  }
  return missing
}`,
    },
    {
      name: 'after an `if` that guards nothing',
      code: `export function read() {
  if (typeof missing !== 'undefined') {
    console.log('defined')
  }
  return missing
}`,
    },
  ])(
    'rejects a read of a free name a typeof check does not guard: $name',
    async ({ code }) => {
      expect(await getModuleErrors(code)).toEqual([
        '`missing` is referenced but never declared or imported',
      ])
    },
  )

  test('accepts names given as globals', async () => {
    expect(
      await getModuleErrors(
        'export const read = () => APP_VERSION',
        'module.ts',
        {
          globals: ['APP_VERSION'],
        },
      ),
    ).toEqual([])
  })

  // Browsers define window properties with generic names: reading one is
  // valid code.
  test('accepts reads of browser globals with generic names', async () => {
    expect(
      await getModuleErrors(
        `export const read = () => [name, status, event, parent, top]`,
      ),
    ).toEqual([])
  })

  // A compiled module that reads a name its source binds, without a binding
  // of its own, lost the local: it reads a global (or nothing) instead.
  describe('with the source module', () => {
    test.each([
      {
        name: 'a dropped declaration named like a browser global',
        source: `const status = 'ready'
export const read = () => status`,
        code: `export const read = () => status`,
        lost: 'status',
      },
      {
        name: 'a dropped parameter',
        source: `export const read = (name: string) => name`,
        code: `export const read = () => name`,
        lost: 'name',
      },
      {
        name: 'a dropped import',
        source: `import { event } from './events'
export const read = () => event`,
        code: `export const read = () => event`,
        lost: 'event',
      },
    ])(
      'rejects a lost local binding: $name',
      async ({ source, code, lost }) => {
        expect(await getModuleErrors(code, 'module.ts', { source })).toEqual([
          `\`${lost}\` is bound in the source module, but read here without a binding`,
        ])
      },
    )

    test('accepts the globals the source reads itself, known or not', async () => {
      const source = `export const read = (top: number) => top
export const global = () => [status, APP_VERSION]`
      expect(
        await getModuleErrors(
          `export const read = (top) => top
export const global = () => [status, APP_VERSION]`,
          'module.ts',
          { source },
        ),
      ).toEqual([])
    })

    test('accepts a lost local in code tree-shaking deletes', async () => {
      expect(
        await getModuleErrors(
          `function unused() { return status }
export const read = () => 'ready'`,
          'module.ts',
          {
            source: `const status = 'ready'
export const read = () => status`,
          },
        ),
      ).toEqual([])
    })
  })

  // User ruling 2026-10-17 (dead-code references, widened): a reference to
  // an undefined name in code the bundlers delete from a production build is
  // no error of the module. The validator deletes what Rolldown's
  // tree-shaking deletes.
  test.each([
    {
      name: 'an uncalled function declaration',
      code: `function unused() { return missing() }`,
    },
    {
      name: 'an unused arrow function',
      code: `const makeOptions = () => ({ component: Page })`,
    },
    {
      name: 'an unused variable with a pure initializer',
      code: `const helpers = { read: () => missing, label: \`\${'a'}\` }`,
    },
    {
      name: 'a dead `if (false)` branch at module level',
      code: `if (false) { missing() }`,
    },
    {
      name: 'a dead `if (false)` branch of an exported function',
      code: `export function read() {
  if (false) { return missing }
  return 'read'
}`,
    },
    {
      name: 'an unused class',
      code: `class Store { static value = inner; read() { return missing } }
function inner() { return <Missing /> }`,
    },
    {
      name: 'mutually recursive unused functions',
      code: `function ping() { return pong() + missing }
const pong = function () { return ping() }`,
    },
    {
      name: 'an unused function only another unused function calls',
      code: `function outer() { return inner() }
function inner() { return <Missing /> }`,
    },
  ])('accepts a free name in $name', async ({ code }) => {
    expect(
      await getModuleErrors(`${code}
export const Route = { component: () => <div /> }`),
    ).toEqual([])
  })

  // The other side of the line: code that survives tree-shaking, whether it
  // runs or not.
  test.each([
    { name: 'module-level code', code: `const value = missing` },
    {
      name: 'a module-level call',
      code: `import { track } from './track'
track(() => missing)`,
    },
    {
      name: 'an exported function',
      code: `export function read() { return missing }`,
    },
    {
      name: 'a function exported by an export list',
      code: `function read() { return missing }
export { read as default }`,
    },
    {
      name: 'a function module-level code calls',
      code: `function read() { return missing }
read()`,
    },
    {
      name: 'a function a route option reads',
      code: `function Page() { return <p>{missing}</p> }
export const Route = { component: Page }`,
    },
    {
      name: 'a function a live function calls',
      code: `function inner() { return missing }
export function outer() { return inner() }`,
    },
    {
      name: 'a function another function passes on',
      code: `function inner() { return missing }
const outer = () => inner
export const Route = { loader: outer }`,
    },
    {
      name: 'a function probed with typeof',
      code: `function inner() { return missing }
console.log(typeof inner)`,
    },
    {
      name: 'a function reassigned at module level',
      code: `let inner = () => missing
inner = inner`,
    },
    {
      // Writing a property of the function is a side effect: both stay.
      name: 'a function module-level code writes a property of',
      code: `function Page() { return missing }
Page.displayName = 'Page'`,
    },
  ])('rejects a free name in $name', async ({ code }) => {
    expect(await getModuleErrors(code)).toEqual([
      '`missing` is referenced but never declared or imported',
    ])
  })
})

describe('declaredNames', () => {
  test('lists every runtime declaration, at any depth, whatever its form', () => {
    expect(
      [
        ...declaredNames(`const a = 1, b = 2
let { c, d: [e = 1], ...f } = {} as any
var g
export function h() {
  const inner = 1
  return inner
}
export default class I {}
enum J { One }
namespace K.L { export const m = 1 }
if (a) { var n = 1 }
for (const o of []) {}`),
      ].sort(),
    ).toEqual(
      [
        'a',
        'b',
        'c',
        'e',
        'f',
        'g',
        'h',
        'inner',
        'I',
        'J',
        'K',
        'm',
        'n',
        'o',
      ].sort(),
    )
  })

  test('does not count imports, parameters, types or ambient declarations', () => {
    expect([
      ...declaredNames(`import { imported } from './lib'
import * as ns from './lib'
type Alias = string
interface Shape {}
declare const ambient: string
declare function ambientFn(): void
declare module './lib' { const augmented: string }
export const read = (param: Alias) => [param, imported, ns, ambient]`),
    ]).toEqual(['read'])
  })
})
