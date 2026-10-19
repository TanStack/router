/**
 * The names the mock modules of import protection expose, in process: every
 * name an importer uses from a denied source, every export of a denied file
 * Each exposed name is a safe mock
 * (`mock-helpers.ts`). The names the mocks miss (reserved words, namespace
 * re-exports, enums and namespaces, a member read before the import) are
 * pinned on real apps: integration/importProtection/known-bugs.test.ts,
 * "app-level twins of the mock pins".
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { describe, expect, test } from 'vitest'
import {
  evaluateWithMock,
  expectSafeMock,
  isSafeMock,
  mockModules,
  selfMock,
} from './mock-helpers'

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
      expectSafeMock(mock[name])
    },
  )

  test.each(kinds)('%s exposes several names at once', async (kind) => {
    const mock = await mockModules[kind](names)
    expect(names.filter((name) => !isSafeMock(mock[name]))).toEqual([])
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
    expect(values.filter((value: unknown) => !isSafeMock(value))).toEqual([])
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
    expect(exported.filter((name) => !isSafeMock(module[name]))).toEqual([])
  })

  test('imports of several denied sources', async () => {
    const { values } = await evaluateWithMock(
      `import { a } from 'mod-a'
import { b } from 'mod-b'
export const values = [a, b]`,
      ['mod-a', 'mod-b'],
    )
    expectSafeMock(values[0])
    expectSafeMock(values[1])
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
    expect(exported.filter((name) => !isSafeMock(mock[name]))).toEqual([])
  })

  // The exports the mock misses (pinned on real apps, see the header) must
  // not cost the others.
  test('an enum next to other exports', async () => {
    const mock = await selfMock(`export enum Color { Red }
export const secret = 1`)
    expectSafeMock(mock.secret)
  })
})
