import { expect, test, vi } from 'vitest'
import { isPromise } from '../src'

test('recognizes callable thenables without invoking them', async () => {
  const error = new Error('then was invoked')
  const then = vi.fn(() => {
    throw error
  })
  const callable = Object.assign(() => undefined, { then })

  expect(isPromise(callable)).toBe(true)
  expect(then).not.toHaveBeenCalled()
  await expect(Promise.resolve(callable)).rejects.toBe(error)
})

test.each([{}, () => undefined])(
  'reads an object or function then accessor once and propagates its error: %s',
  (value) => {
    const error = new Error('then accessor failed')
    const read = vi.fn(() => {
      throw error
    })
    Object.defineProperty(value, 'then', { get: read })
    expect(() => isPromise(value)).toThrow(error)
    expect(read).toHaveBeenCalledOnce()
  },
)

test('recognizes native promises and object thenables, and rejects ordinary values', () => {
  expect(isPromise(Promise.resolve())).toBe(true)
  expect(isPromise({ then: () => undefined })).toBe(true)
  for (const value of [undefined, null, false, 0, '', {}, () => undefined]) {
    expect(isPromise(value)).toBe(false)
  }
})
