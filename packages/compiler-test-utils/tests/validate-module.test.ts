/**
 * Controls of the module validator (validate-module.ts): it rejects a module
 * a runtime could not load or that would throw a ReferenceError, and accepts
 * every way a module legitimately declares, imports or probes a name.
 */
import { describe, expect, test } from 'vitest'
import { declaredNames, getModuleErrors } from '../src/validate-module'

describe('getModuleErrors', () => {
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

  // A `@jsx`/`@jsxFrag` pragma without `@jsxRuntime`/`@jsxImportSource` only
  // works as written under a classic default runtime (SWC and Babel reject it
  // under the automatic runtime, Oxc and esbuild ignore it), so the module is
  // checked as classic: its factory and fragment names must exist.
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
      // pragma still marks a classic project, whose default factory Oxc uses.
      name: '`@jsx` below an import, default factory missing',
      code: `import { h } from 'preact'
/** @jsx h */
export const Page = () => <div>{h('i', null)}</div>`,
      errors: ['`React` is referenced but never declared or imported'],
    },
  ])('checks a classic pragma module: $name', async ({ code, errors }) => {
    expect(await getModuleErrors(code)).toEqual(errors)
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
