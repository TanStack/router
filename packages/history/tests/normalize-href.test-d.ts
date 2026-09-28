import { expectTypeOf, test } from 'vitest'
import { _normalizeHref } from '../src'

test('the shared href normalizer accepts and returns strings', () => {
  expectTypeOf(_normalizeHref).toEqualTypeOf<(href: string) => string>()
})
