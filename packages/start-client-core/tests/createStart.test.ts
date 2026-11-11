import { expect, test } from 'vitest'
import { createSerializationAdapter } from '@tanstack/router-core'
import { createStart } from '../src/createStart'

const base = createSerializationAdapter({
  key: 'base',
  test: (value): value is 'base' => value === 'base',
  toSerializable: () => 'base',
  fromSerializable: () => 'base' as const,
})
const extended = createSerializationAdapter({
  key: 'extended',
  extends: [base],
  test: (value): value is 'extended' => value === 'extended',
  toSerializable: () => 'extended',
  fromSerializable: () => 'extended' as const,
})

test('getOptions returns the options of a synchronous factory synchronously', () => {
  const options = createStart(() => ({
    serializationAdapters: [extended, base, extended],
  })).getOptions()

  expect(options).not.toBeInstanceOf(Promise)
  expect(
    (options as { serializationAdapters: Array<unknown> })
      .serializationAdapters,
  ).toEqual([extended, base])
})

test('getOptions resolves the options of an asynchronous factory', async () => {
  const options = await createStart(async () => ({
    serializationAdapters: [extended, base, extended],
  })).getOptions()

  expect(options.serializationAdapters).toEqual([extended, base])
})

test('getOptions adopts a thenable that a factory returns', async () => {
  const error = new Error('boom')
  const resolving = createStart(
    () =>
      ({
        then(resolve: (value: unknown) => void) {
          resolve({ serializationAdapters: [extended, base, extended] })
        },
      }) as never,
  )
  const rejecting = createStart(
    () =>
      ({
        then(_: unknown, reject: (reason: unknown) => void) {
          reject(error)
        },
      }) as never,
  )

  await expect(resolving.getOptions()).resolves.toEqual({
    serializationAdapters: [extended, base],
  })
  await expect(rejecting.getOptions()).rejects.toBe(error)
})
