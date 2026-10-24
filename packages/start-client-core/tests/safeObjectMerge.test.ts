import { expect, test } from 'vitest'
import { createNullProtoObject, safeObjectMerge } from '../src/safeObjectMerge'

// JSON.parse creates `__proto__` as an own key, as a deserialized payload can.
const unsafe = JSON.parse(
  '{"__proto__":{"polluted":true},"constructor":1,"kept":"source","prototype":2,"added":true}',
)

test('safeObjectMerge copies own keys in order into a null-prototype object', () => {
  const merged = safeObjectMerge<Record<string, unknown>>(
    { first: 1, kept: 'target' },
    unsafe,
  )

  expect(Object.getPrototypeOf(merged)).toBeNull()
  expect(Object.keys(merged)).toEqual(['first', 'kept', 'added'])
  expect(merged.kept).toBe('source')
  expect(({} as Record<string, unknown>).polluted).toBeUndefined()
})

test('safeObjectMerge ignores a source that is not an object', () => {
  const merged = safeObjectMerge<Record<string, unknown>>(
    { first: 1 },
    'source' as never,
  )

  expect(Object.keys(merged)).toEqual(['first'])
})

test('createNullProtoObject copies own keys without prototype keys', () => {
  expect(Object.getPrototypeOf(createNullProtoObject())).toBeNull()

  const copy = createNullProtoObject(unsafe)

  expect(Object.getPrototypeOf(copy)).toBeNull()
  expect(Object.keys(copy)).toEqual(['kept', 'added'])
})
