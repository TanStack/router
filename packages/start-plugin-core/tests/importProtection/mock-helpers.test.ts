/**
 * Controls of the mock helpers (`mock-helpers.ts`): the safe-mock probe
 * accepts the mock import protection serves and rejects real values and
 * leaking stand-ins, in this process and serialised into a script; an
 * importer evaluated with a denied import gets mocks for exactly what it
 * uses from that import, and the self-contained mock of a denied file
 * exposes its exports as mocks.
 */
import vm from 'node:vm'
import { describe, expect, test } from 'vitest'
import {
  describeValue,
  describeValuePrelude,
  evaluateWithMock,
  expectSafeMock,
  isSafeMock,
  probeMock,
  probeMockPrelude,
  safeMock,
  selfMock,
} from './mock-helpers'

describe('the safe-mock probe', () => {
  /** A stand-in of a mock: a recursive Proxy whose text is `label`. */
  function recursiveProxy(label: string): unknown {
    const node = (): unknown =>
      new Proxy(function () {}, {
        get: (_target, prop) =>
          prop === Symbol.toPrimitive || prop === 'toString' || prop === 'toJSON'
            ? () => label
            : node(),
        apply: () => node(),
        construct: () => node() as object,
      })
    return node()
  }

  test('accepts a recursive proxy, whatever its label', () => {
    for (const label of ['[import-protection mock]', 'mock', '']) {
      expectSafeMock(recursiveProxy(label), 'MARK_SECRET')
    }
  })

  test.each([
    ['a function', () => 'x'],
    ['a string', 'x'],
    ['a number', 1],
    ['undefined', undefined],
    ['an object', {}],
    ['an object with members', { member: { deeper: 1 } }],
    ['a class', class Client {}],
  ])('rejects %s', (_name, value) => {
    expect(isSafeMock(value)).toBe(false)
    expect(probeMock(value)).not.toEqual(safeMock)
  })

  test('rejects a proxy whose primitive conversion leaks the secret', () => {
    expect(probeMock(recursiveProxy('MARK_SECRET'), 'MARK_SECRET')).toEqual({
      ...safeMock,
      leaked: true,
    })
    expect(isSafeMock(recursiveProxy('MARK_SECRET'))).toBe(true)
  })

  test('rejects a mock that throws on construction', () => {
    const value = new Proxy(function () {}, {
      get: () => value,
      apply: () => value,
      construct: () => {
        throw new Error('not a constructor')
      },
    })
    expect(probeMock(value)).toMatchObject({
      read: 'ok',
      call: 'ok',
      construct: 'threw: not a constructor',
    })
  })

  test('serialised into a script, it gives the same verdicts', () => {
    const script = `${describeValuePrelude}
;[
  isSafeMock(mock, 'MARK_SECRET'),
  isSafeMock(() => 'x'),
  describeValue(mock),
  describeValue('MARK_REAL'),
  probeMock(leaking, 'MARK_SECRET').leaked,
]`
    const context = vm.createContext({
      mock: recursiveProxy('mock'),
      leaking: recursiveProxy('MARK_SECRET'),
    })
    expect(vm.runInContext(script, context)).toEqual([
      true,
      false,
      'a safe mock',
      'MARK_REAL',
      true,
    ])
    expect(describeValue(recursiveProxy('mock'))).toBe('a safe mock')
  })
})

test('evaluateWithMock: every binding the importer uses from the denied source is a safe mock', async () => {
  const module = await evaluateWithMock(
    `import def, { a } from 'denied'
import * as ns from 'denied'
export const values = [def, a, ns.b, ns.c(), a.deep.call()]`,
    'denied',
  )
  expect(module.values.map((value: unknown) => probeMock(value))).toEqual(
    module.values.map(() => safeMock),
  )
})

test('evaluateWithMock: only the denied source is mocked; other imports need stubs', async () => {
  const importer = `import { a } from 'denied'
import { b } from 'allowed'
export const values = [a, b]`
  const module = await evaluateWithMock(importer, 'denied', {
    stubs: { allowed: { b: 'real' } },
  })
  expectSafeMock(module.values[0])
  expect(module.values[1]).toBe('real')
  await expect(evaluateWithMock(importer, 'denied')).rejects.toThrow(
    'No stub for import allowed',
  )
})

test('selfMock: the mock of a denied file exposes its exports as safe mocks', async () => {
  const mock = await selfMock(`export const a = 1
export function b() {}
export default 'x'`)
  expect(Object.keys(mock)).toEqual(
    expect.arrayContaining(['a', 'b', 'default']),
  )
  for (const value of [mock.a, mock.b, mock.default]) {
    expectSafeMock(value)
  }
})
