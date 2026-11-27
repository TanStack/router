import { describe, expectTypeOf, test } from 'vitest'
import { notFound } from '../src'
import type { NotFoundError } from '../src'

describe('notFound', () => {
  test('returns NotFoundError when called without options', () => {
    expectTypeOf(notFound()).toEqualTypeOf<NotFoundError>()
  })

  test('returns NotFoundError when throw is not true', () => {
    expectTypeOf(notFound({ data: 'x' })).toEqualTypeOf<NotFoundError>()
    expectTypeOf(notFound({ throw: false })).toEqualTypeOf<NotFoundError>()
  })

  test('returns NotFoundError when throw is a non-literal boolean', () => {
    const shouldThrow: boolean = Math.random() > 0.5
    expectTypeOf(
      notFound({ throw: shouldThrow }),
    ).toEqualTypeOf<NotFoundError>()
  })

  test('returns never when throw is true', () => {
    expectTypeOf(notFound({ throw: true })).toBeNever()
  })

  test('narrows after notFound({ throw: true })', () => {
    function getUser(user: { name: string } | undefined) {
      if (!user) {
        notFound({ throw: true })
      }
      return user
    }

    expectTypeOf(getUser).returns.toEqualTypeOf<{ name: string }>()
  })
})
