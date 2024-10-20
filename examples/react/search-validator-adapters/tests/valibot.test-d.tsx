import { Link } from '@tanstack/react-router'
import { expectTypeOf, test } from 'vitest'

import { router } from '../src/main'
import { Route as ValibotRoute } from '../src/routes/users/valibot.index'

test('infers correct input and output type for valibot', () => {
  expectTypeOf(Link<typeof router, string, '/users/valibot'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<boolean | ((...args: any[]) => any)>()
    .toEqualTypeOf<{ search?: string } | undefined>()

  expectTypeOf(ValibotRoute.useSearch()).toEqualTypeOf<{ search: string }>()
})
