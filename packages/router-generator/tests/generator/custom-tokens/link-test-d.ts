import { expectTypeOf, test } from 'vitest'
import { Link, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const defaultRouter = createRouter({
  routeTree,
})

const alwaysTrailingSlashRouter = createRouter({
  routeTree,
  trailingSlash: 'always',
})

const neverTrailingSlashRouter = createRouter({
  routeTree,
  trailingSlash: 'never',
})

const preserveTrailingSlashRouter = createRouter({
  routeTree,
  trailingSlash: 'preserve',
})

test('append and prepend resolves to a correct route', () => {
  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<typeof alwaysTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/blog/'
      | '/posts/'
      | '/blog/$slug/'
      | '/posts/$postId/deep/'
      | '/posts/$postId/'
      | undefined
    >()

  expectTypeOf(Link<typeof neverTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
      | '/blog/'
      | '/posts/'
      | '/blog/$slug/'
      | '/posts/$postId/deep/'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<true | { search: string }>()
})
