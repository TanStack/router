import { expectTypeOf, test } from 'vitest'
import { isPromise } from '../src'

test('accepts generic thenables and preserves explicit Awaited narrowing', () => {
  const narrow = <T>(
    value: T | PromiseLike<T> | Promise<Awaited<T>>,
  ): Promise<Awaited<T>> | undefined =>
    isPromise<T>(value) ? value : undefined

  const thenable: PromiseLike<string> = Promise.resolve('ready')
  expectTypeOf(narrow<string>(thenable)).toEqualTypeOf<
    Promise<string> | undefined
  >()
  expectTypeOf(narrow<Promise<string>>(Promise.resolve('ready'))).toEqualTypeOf<
    Promise<string> | undefined
  >()
})
