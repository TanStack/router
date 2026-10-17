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

  // User ruling 2026-10-17: a reference to an undefined name inside code
  // that never runs throws nothing, so it is no error of the module (whether
  // it reaches a production bundle is a build-level question). Dead code is
  // approximated as module-level functions that are not exported and that
  // nothing else reads.
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

  // The other side of the line: code that runs, or may run.
  test.each([
    { name: 'module-level code', code: `const value = missing` },
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
      name: 'a function a class reads',
      code: `function inner() { return missing }
class Store { static value = inner }`,
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
      // Declared twice: which declaration runs is not decided statically.
      name: 'a function whose name is declared twice',
      code: `var inner = () => missing
if (globalThis) { var inner = () => 'other' }`,
    },
    {
      name: 'a function body nested in an object',
      code: `const helpers = { read: () => missing }`,
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
