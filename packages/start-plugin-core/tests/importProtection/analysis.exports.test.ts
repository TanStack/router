import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { describe, expect, test } from 'vitest'

import {
  getImportSpecifierLocationFromResult,
  getImportSources,
} from '../../src/import-protection/analysis'
import { evaluateWithMock, isMock, mockModules, selfMock } from './mock-helpers'

// Every name a consumer can import is exposed by each mock module import
// protection generates for it (and the module evaluates).
describe('mock modules expose every importable name', () => {
  const kinds = Object.keys(mockModules) as Array<keyof typeof mockModules>
  const names = [
    'valid',
    '_private',
    '$ref',
    'camelCase',
    'A',
    '1foo',
    'foo-bar',
    'foo.bar',
    'foo bar',
    '~lead',
    'a~b',
    'a:b',
    '|x',
    'a^b',
    'default',
  ]

  test.each(kinds.flatMap((kind) => names.map((name) => ({ kind, name }))))(
    '$kind exposes "$name"',
    async ({ kind, name }) => {
      const mock = await mockModules[kind]([name])
      expect(name in mock).toBe(true)
      expect(isMock(mock[name])).toBe(true)
    },
  )

  test.each(kinds)('%s exposes several names at once', async (kind) => {
    const mock = await mockModules[kind](names)
    expect(names.filter((name) => !isMock(mock[name]))).toEqual([])
  })

  // Bug: mock modules drop the empty export name (`filterExportNames` in
  // import-protection/virtualModules.ts keeps only non-empty names).
  // Impact: a consumer importing `{ "" as x }` from a denied module gets a
  // link error ("does not provide an export named ''") instead of the mock.
  test.fails.each(kinds)('%s exposes the empty name ""', async (kind) => {
    const mock = await mockModules[kind]([''])
    expect('' in mock).toBe(true)
    expect(isMock(mock[''])).toBe(true)
  })

  // Bug: mock modules declare each mocked name as `export const <name>`, and
  // reserved words such as `delete` pass the identifier check
  // (`isValidExportName`); `eval` and `arguments` cannot be bound in a module
  // either. Same bug as the `delete` pin in known-bugs.test.ts.
  // Impact: the mock of a module that exports such a name, or is used
  // through one (`api.delete()`), is a SyntaxError, which fails the build or
  // the dev page instead of mocking the module.
  test.fails.each(
    kinds.flatMap((kind) =>
      ['delete', 'eval', 'arguments'].map((name) => ({ kind, name })),
    ),
  )('$kind exposes the reserved name "$name"', async ({ kind, name }) => {
    const mock = await mockModules[kind]([name])
    expect(name in mock).toBe(true)
    expect(isMock(mock[name])).toBe(true)
  })
})

// An importer of a denied module links against the mock import protection
// serves for it, and every binding it uses from the denied module is a mock.
describe('an importer evaluates with mocks for what it uses', () => {
  test.each([
    {
      name: 'named imports',
      importer: `import { alpha, beta } from 'mod-a'
export const values = [alpha, beta]`,
    },
    {
      name: 'a default import',
      importer: `import def from 'mod-a'
export const values = [def]`,
    },
    {
      name: '`{ default as x }`',
      importer: `import { default as myDefault } from 'mod-a'
export const values = [myDefault]`,
    },
    {
      name: 'namespace members',
      importer: `import * as ns from 'mod-a'
export const values = [ns.alpha, ns.beta]`,
    },
    {
      name: 'an optional namespace member call',
      importer: `import * as ns from 'mod-a'
export const values = [ns.gamma?.()]`,
    },
    {
      name: 'a string-literal computed namespace member',
      importer: `import * as ns from 'mod-a'
export const values = [ns['delta']]`,
    },
    {
      name: 'members of a default import',
      importer: `import mock from 'mod-a'
export const values = [mock.getSecret, mock['foo-bar']]`,
    },
    {
      name: 'a value specifier next to a type specifier',
      importer: `import { type Foo, bar } from 'mod-a'
export const values = [bar as unknown as Foo]`,
    },
    {
      name: 'several imports of the same source',
      importer: `import { alpha } from 'mod-a'
import { beta } from 'mod-a'
export const values = [alpha, beta]`,
    },
    {
      name: 'a string-keyed import specifier',
      importer: `import { "foo-bar" as x } from 'mod-a'
export const values = [x]`,
    },
    {
      name: 'parenthesized namespace calls',
      importer: `import * as denied from 'mod-a'
export const values = [(denied).read(), (denied)['write']()]`,
    },
  ])('$name', async ({ importer }) => {
    const { values } = await evaluateWithMock(importer, 'mod-a')
    expect(values.map(isMock)).toEqual(values.map(() => true))
  })

  test.each([
    {
      name: 're-exports',
      importer: `export { alpha, beta } from 'mod-a'`,
      exported: ['alpha', 'beta'],
    },
    {
      name: 'a string-literal re-export',
      importer: `export { "foo-bar" as baz } from 'mod-a'`,
      exported: ['baz'],
    },
    {
      name: 'an import and a re-export of the same name',
      importer: `import { alpha } from 'mod-a'
export { alpha } from 'mod-a'
export const used = alpha`,
      exported: ['alpha', 'used'],
    },
  ])('$name', async ({ importer, exported }) => {
    const module = await evaluateWithMock(importer, 'mod-a')
    expect(Object.keys(module).sort()).toEqual(exported)
    expect(exported.filter((name) => !isMock(module[name]))).toEqual([])
  })

  test('imports of several denied sources', async () => {
    const { values } = await evaluateWithMock(
      `import { a } from 'mod-a'
import { b } from 'mod-b'
export const values = [a, b]`,
      ['mod-a', 'mod-b'],
    )
    expect(values.map(isMock)).toEqual([true, true])
  })

  // Best effort: a namespace object cannot expose names it does not know, so
  // only the module evaluating is required.
  test('a namespace member read with a computed key', async () => {
    const module = await evaluateWithMock(
      `import * as ns from 'mod-a'
const key = 'epsilon'
export const value = ns[key]`,
      'mod-a',
    )
    expect(Object.keys(module)).toEqual(['value'])
  })

  // Bug: namespace member reads are collected only after the import
  // declaration that binds the namespace, but imports are hoisted: a member
  // read earlier in the file (e.g. in a function declared above the import)
  // is not exported by the mock edge.
  // Impact: the read gets `undefined` instead of the mock, so the importer
  // crashes on it in dev (`ns.alpha()` is not a function).
  // Source: PR #8504 (analysis.exports.test.ts "collects namespace member
  // usage that precedes the import").
  test.fails('a namespace member read before the import', async () => {
    const { values } = await evaluateWithMock(
      `export const values = [ns.alpha]
import * as ns from 'mod-a'`,
      'mod-a',
    )
    expect(values.map(isMock)).toEqual([true])
  })
})

/**
 * Evaluates `code`, a denied file, with `obj` and `arr` in scope and `./foo`
 * stubbed, and returns its namespace.
 */
function evaluateOriginal(code: string) {
  const id = '/test/src/denied.server.ts'
  return createModuleGraph({
    modules: { [id]: code },
    stubs: { './foo': { default: 'foo', x: 'x' } },
    scope: () => ({
      obj: { a: { b: 1, c: 2 }, b: 2, d: 4 },
      arr: [1, 2],
    }),
  }).import(id)
}

// The self-contained mock of a denied file exposes every export of the file,
// each a mock.
describe('the mock of a denied file exposes its exports', () => {
  const cases = [
    {
      name: 'declarations',
      code: `export function alpha() {}
export const beta = 1
export class Gamma {}`,
    },
    {
      name: 'export specifiers and aliases',
      code: `const local = 1
const x = 2
export { local as renamed, x }`,
    },
    {
      name: 'a default export next to a type-only re-export',
      code: `export default function main() {}
export type { Foo } from 'mod-a'`,
    },
    { name: 'object destructuring', code: `export const { a, b } = obj` },
    { name: 'array destructuring', code: `export const [x, y] = arr` },
    {
      name: 'an array destructuring rest element',
      code: `export const [first, ...others] = arr`,
    },
    {
      name: 'renamed destructuring',
      code: `export const { a: renamed } = obj`,
    },
    {
      name: 'nested destructuring',
      code: `export const { a: { b, c } } = obj`,
    },
    {
      name: 'destructuring with defaults',
      code: `export const { a = 1, b = 2 } = obj`,
    },
    {
      name: 'a destructuring rest element',
      code: `export const { a, ...rest } = obj`,
    },
    {
      name: 'a default re-export alias',
      code: `export { default as hello } from './foo'`,
    },
    {
      name: 'a string export name',
      code: `const local = 1
export { local as "foo-bar" }`,
    },
  ]

  test.each(cases)('$name', async ({ code }) => {
    const exported = Object.keys(await evaluateOriginal(code))
    const mock = await selfMock(code)
    expect(exported.length).toBeGreaterThan(0)
    expect(Object.keys(mock)).toEqual(expect.arrayContaining(exported))
    expect(exported.filter((name) => !isMock(mock[name]))).toEqual([])
  })

  // The exports the mock misses (pinned below) must not cost the others.
  test('an enum next to other exports', async () => {
    const mock = await selfMock(`export enum Color { Red }
export const secret = 1`)
    expect(isMock(mock.secret)).toBe(true)
  })

  // Bug: the export names of a denied file skip namespace re-exports
  // (`export * as ns from`).
  // Source: src/import-protection/analysis.ts:270-275 (only the names of
  // `ExportSpecifier`s are collected).
  // Impact: the mock served in place of the file has no `ns`, so an importer
  // of `ns` fails to link (build: missing export error; dev: the page fails
  // to load).
  test.fails('a namespace re-export', async () => {
    const code = `export * as ns from './foo'`
    const exported = Object.keys(await evaluateOriginal(code))
    const mock = await selfMock(code)
    expect(exported).toEqual(['ns'])
    expect(isMock(mock.ns)).toBe(true)
  })

  // Bug: the export names of a denied file skip enums and namespaces.
  // Impact: the mock served in place of the file misses these exports, so
  // an importer of `Color` or `Util` fails to link (build: missing export
  // error; dev: the page fails to load).
  // Source: PR #8504 (analysis.exports.test.ts "collects namespace
  // re-exports, enums and namespaces").
  test.fails('an enum and a namespace', async () => {
    const code = `export enum Color { Red }
export namespace Util { export const x = 1 }`
    const exported = Object.keys(await evaluateOriginal(code))
    const mock = await selfMock(code)
    expect(exported.sort()).toEqual(['Color', 'Util'])
    expect(Object.keys(mock)).toEqual(expect.arrayContaining(exported))
    expect(exported.filter((name) => !isMock(mock[name]))).toEqual([])
  })
})

test('discovers parenthesized literal dynamic import sources', () => {
  expect(getImportSources(`export const value = import(('denied'))`)).toEqual([
    'denied',
  ])
})

test('namespace and default re-exports are import sources', () => {
  const code = [
    `export * as ns from 'denied-a'`,
    `export { default } from 'denied-b'`,
    `export type { OnlyType } from 'denied-c'`,
  ].join('\n')
  expect(getImportSources(code)).toEqual(['denied-a', 'denied-b'])
  const result = { code, map: undefined, originalCode: undefined }
  expect(getImportSpecifierLocationFromResult(result, 'denied-a')).toBe(
    code.indexOf('denied-a'),
  )
  expect(getImportSpecifierLocationFromResult(result, 'denied-c')).toBe(-1)
})
