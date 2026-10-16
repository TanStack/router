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
