import { expectTypeOf, test } from 'vitest'
import { Link, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const defaultRouter = createRouter({
  routeTree,
})

test('append and prepend resolves to a correct route', () => {
  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<'/' | undefined>()

  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<'/' | undefined>()

  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<true | { search: string; indexSearch: string }>()
})
