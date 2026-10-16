/**
 * Controls of the mock helpers (`mock-helpers.ts`): an importer evaluated with
 * a denied import gets mocks for exactly what it uses from that import, and
 * the self-contained mock of a denied file exposes its exports as mocks.
 */
import { expect, test } from 'vitest'
import { evaluateWithMock, isMock, selfMock } from './mock-helpers'

test('evaluateWithMock: every binding the importer uses from the denied source is a mock', async () => {
  const module = await evaluateWithMock(
    `import def, { a } from 'denied'
import * as ns from 'denied'
export const values = [def, a, ns.b, ns.c(), a.deep.call()]`,
    'denied',
  )
  expect(module.values.map(isMock)).toEqual([true, true, true, true, true])
})

test('evaluateWithMock: only the denied source is mocked; other imports need stubs', async () => {
  const importer = `import { a } from 'denied'
import { b } from 'allowed'
export const values = [a, b]`
  const module = await evaluateWithMock(importer, 'denied', {
    stubs: { allowed: { b: 'real' } },
  })
  expect(isMock(module.values[0])).toBe(true)
  expect(module.values[1]).toBe('real')
  await expect(evaluateWithMock(importer, 'denied')).rejects.toThrow(
    'No stub for import allowed',
  )
})

test('selfMock: the mock of a denied file exposes its exports as mocks', async () => {
  const mock = await selfMock(`export const a = 1
export function b() {}
export default 'x'`)
  expect(Object.keys(mock)).toEqual(
    expect.arrayContaining(['a', 'b', 'default']),
  )
  expect([mock.a, mock.b, mock.default].map(isMock)).toEqual([true, true, true])
})

test('isMock is false for values that are not mocks', () => {
  expect([() => 'x', 'x', 1, undefined, {}].map(isMock)).toEqual([
    false,
    false,
    false,
    false,
    false,
  ])
})
