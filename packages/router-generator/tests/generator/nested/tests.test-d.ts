import {
  createRouter,
  Link,
  MakeRouteMatch,
  redirect,
  useLoaderData,
  useLoaderDeps,
  useMatch,
  useNavigate,
  useParams,
  useRouteContext,
  useSearch,
} from '@tanstack/react-router'
import { test, expectTypeOf } from 'vitest'
import { routeTree } from './routeTree.gen'

const defaultRouter = createRouter({
  routeTree,
})

type DefaultRouter = typeof defaultRouter

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

test('when navigating to the root', () => {
  expectTypeOf(Link<typeof defaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
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
      | '/blog/stats/'
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
      | '/blog/stats'
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
      | '/blog/stats'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | '/blog/'
      | '/posts/'
      | '/blog/$slug/'
      | '/blog/stats/'
      | '/posts/$postId/deep/'
      | '/posts/$postId/'
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
      | '/blog/stats'
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
    .toEqualTypeOf<true | {} | undefined>()

  expectTypeOf(Link<typeof alwaysTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<true | {} | undefined>()

  expectTypeOf(Link<typeof neverTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<true | {} | undefined>()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<true | {} | undefined>()
})

test('when navigating a index route with search and params', () => {
  expectTypeOf(Link<typeof defaultRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '.'
      | '..'
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | undefined
    >()

  expectTypeOf(
    Link<typeof alwaysTrailingSlashRouter, string, '/posts/$postId/'>,
  )
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | './'
      | '../'
      | '/'
      | '/blog/'
      | '/posts/'
      | '/blog/$slug/'
      | '/blog/stats/'
      | '/posts/$postId/deep/'
      | '/posts/$postId/'
      | undefined
    >()

  expectTypeOf(Link<typeof neverTrailingSlashRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | '.'
      | '..'
      | undefined
    >()

  expectTypeOf(
    Link<typeof preserveTrailingSlashRouter, string, '/posts/$postId'>,
  )
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '..'
      | '../'
      | '.'
      | './'
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | '/blog/'
      | '/posts/'
      | '/blog/$slug/'
      | '/blog/stats/'
      | '/posts/$postId/deep/'
      | '/posts/$postId/'
      | undefined
    >()

  expectTypeOf(Link<typeof defaultRouter, '/', '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | undefined
    >()

  expectTypeOf(Link<typeof defaultRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ indexSearch: string }>()

  expectTypeOf(Link<typeof defaultRouter, string, '/posts/$postId/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<never>()

  expectTypeOf(
    Link<typeof alwaysTrailingSlashRouter, string, '/posts/$postId/'>,
  )
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ indexSearch: string }>()

  expectTypeOf(Link<typeof alwaysTrailingSlashRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<never>()

  expectTypeOf(Link<typeof neverTrailingSlashRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ indexSearch: string }>()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ indexSearch: string }>()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/posts/$postId/'>)
    .parameter(0)
    .toHaveProperty('search')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ indexSearch: string }>()

  expectTypeOf(Link<typeof defaultRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ postId: string }>()

  expectTypeOf(Link<typeof defaultRouter, string, '/posts/$postId/'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<never>()

  expectTypeOf(
    Link<typeof alwaysTrailingSlashRouter, string, '/posts/$postId/'>,
  )
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ postId: string }>()

  expectTypeOf(Link<typeof alwaysTrailingSlashRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<never>()

  expectTypeOf(Link<typeof neverTrailingSlashRouter, string, '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ postId: string }>()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/posts/$postId'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ postId: string }>()

  expectTypeOf(Link<typeof preserveTrailingSlashRouter, '/', '/posts/$postId/'>)
    .parameter(0)
    .toHaveProperty('params')
    .exclude<(...args: any) => any>()
    .toEqualTypeOf<{ postId: string }>()
})

test('when navigating from a index route with search and params', () => {
  expectTypeOf(Link<typeof defaultRouter, '/posts/$postId', undefined>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | undefined
    >()

  expectTypeOf(Link<typeof defaultRouter, '/posts/$postId', undefined>)
    .parameter(0)
    .toHaveProperty('search')
    .parameter(0)
    .toEqualTypeOf<{ indexSearch: string }>()
})

test('when using useNavigate', () => {
  const navigate = useNavigate()

  expectTypeOf(navigate<DefaultRouter, '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '.'
      | '..'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/posts/$postId/deep'
      | '/posts/$postId'
      | undefined
    >()
})

test('when using redirect', () => {
  expectTypeOf(redirect<DefaultRouter, '/', '/'>)
    .parameter(0)
    .toHaveProperty('to')
    .toEqualTypeOf<
      | '/'
      | '/posts/$postId'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/posts/$postId/deep'
      | undefined
    >()
})

test('when using useSearch from a route with no search', () => {
  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/blog'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/blog'>,
  ).returns.toEqualTypeOf<{}>()
})

test('when using useSearch from a route with search', () => {
  expectTypeOf(useSearch<DefaultRouter['routeTree'], '/blog'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useSearch<DefaultRouter['routeTree'], '/posts/$postId/'>,
  ).returns.toEqualTypeOf<{ indexSearch: string }>()
})

test('when using useLoaderData from a route with loaderData', () => {
  expectTypeOf(useLoaderData<DefaultRouter['routeTree'], '/posts/$postId/deep'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useLoaderData<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  ).returns.toEqualTypeOf<{ data: string }>()
})

test('when using useLoaderDeps from a route with loaderDeps', () => {
  expectTypeOf(useLoaderDeps<DefaultRouter['routeTree'], '/posts/$postId/deep'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useLoaderDeps<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  ).returns.toEqualTypeOf<{ dep: number }>()
})

test('when using useMatch from a route', () => {
  expectTypeOf(useMatch<DefaultRouter['routeTree'], '/posts/$postId/deep'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useMatch<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  ).returns.toEqualTypeOf<
    MakeRouteMatch<DefaultRouter['routeTree'], '/posts/$postId/deep', true>
  >()
})

test('when using useParams from a route', () => {
  expectTypeOf(useParams<DefaultRouter['routeTree'], '/posts/$postId/deep'>)
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useParams<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  ).returns.toEqualTypeOf<{ postId: string }>()
})

test('when using useRouteContext from a route', () => {
  expectTypeOf(
    useRouteContext<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  )
    .parameter(0)
    .toHaveProperty('from')
    .toEqualTypeOf<
      | '/'
      | '/blog'
      | '/posts'
      | '/blog/$slug'
      | '/blog/stats'
      | '/blog/'
      | '/posts/'
      | '/posts/$postId/deep'
      | '/posts/$postId/'
    >()

  expectTypeOf(
    useRouteContext<DefaultRouter['routeTree'], '/posts/$postId/deep'>,
  ).returns.toEqualTypeOf<{ someContext: string }>()
})
