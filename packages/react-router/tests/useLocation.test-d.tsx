import { expectTypeOf, test } from 'vitest'
import { useLocation, type ParsedLocation } from '../src'

test('should have the types for a ParsedLocation in useLocation', () => {
  const location = useLocation()

  expectTypeOf(location).toEqualTypeOf<ParsedLocation>()
  expectTypeOf(location).toHaveProperty('pathname').toEqualTypeOf<string>()
})

test('should have the type of string for selecting the pathname in useLocation', () => {
  const location = useLocation({
    select: (state) => state.pathname,
  })

  expectTypeOf(location).toEqualTypeOf<string>()
})
