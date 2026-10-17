import { describe, expectTypeOf, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type {
  AnyRouter,
  BuildNextOptions,
  FromPathOption,
  NavigateFn,
  NavigateOptions,
  RegisteredRouter,
  RouteMask,
  ToMaskOptions,
} from '../src'

const rootRoute = new BaseRootRoute()
const indexRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/',
})
const visibleRoute = new BaseRoute({
  getParentRoute: () => rootRoute,
  path: '/visible/$id',
  validateSearch: (search: { required: string }) => search,
})
const routeTree = rootRoute.addChildren([indexRoute, visibleRoute])
const router = createTestRouter({ routeTree })
type Mask = ToMaskOptions<typeof router, '/', '/visible/$id'>
type InheritedMask = {
  to: '/visible/$id'
  params: { id: string }
  inheritSearch: true
}

// The framework bindings merge a generic default `from` into registered-router
// options before forwarding to the native navigate function.
function defaultedNavigate<
  TRouter extends AnyRouter = RegisteredRouter,
  TDefaultFrom extends string = string,
>(
  navigate: NavigateFn,
  defaults?: { from?: FromPathOption<TRouter, TDefaultFrom> },
) {
  return {
    explicitOverride: (options: NavigateOptions) =>
      navigate({ ...options, from: options.from ?? defaults?.from }),
    spreadOverride: (options: NavigateOptions) =>
      navigate({ from: defaults?.from, ...options }),
  }
}

describe('route mask inherited search types', () => {
  test('forwards generic default navigation options through native binding wrappers', () => {
    const navigate = defaultedNavigate(router.navigate, { from: '/' })
    expectTypeOf(navigate.explicitOverride({ to: '/' })).toEqualTypeOf<
      Promise<void>
    >()
    expectTypeOf(navigate.spreadOverride({ to: '/' })).toEqualTypeOf<
      Promise<void>
    >()
  })

  test('retains route-path constraints for concrete router types', () => {
    expectTypeOf<FromPathOption<typeof router, string>>().toEqualTypeOf<
      '/' | '/visible/$id'
    >()
    expectTypeOf<'/missing'>().not.toMatchTypeOf<
      FromPathOption<typeof router, '/missing'>
    >()
  })

  test('inherits resolved search without requiring the mask route search input', () => {
    expectTypeOf<InheritedMask>().toMatchTypeOf<Mask>()
    expectTypeOf<Omit<InheritedMask, 'params'>>().not.toMatchTypeOf<Mask>()
  })

  test('retains required search for ordinary masks', () => {
    expectTypeOf<{
      to: '/visible/$id'
      params: { id: string }
      search: { required: string }
    }>().toMatchTypeOf<Mask>()
    expectTypeOf<{
      to: '/visible/$id'
      params: { id: string }
    }>().not.toMatchTypeOf<Mask>()
  })

  test('forbids search alongside inheritance for every mask API', () => {
    type ConflictingMask = InheritedMask & { search: { required: string } }
    expectTypeOf<ConflictingMask>().not.toMatchTypeOf<Mask>()
    expectTypeOf<ConflictingMask>().not.toMatchTypeOf<
      NonNullable<BuildNextOptions['mask']>
    >()
    expectTypeOf<
      ConflictingMask & { routeTree: typeof routeTree; from: '/' }
    >().not.toMatchTypeOf<RouteMask<typeof routeTree>>()
  })

  test('allows configured and build-location masks to opt into inheritance', () => {
    expectTypeOf<InheritedMask>().toMatchTypeOf<
      NonNullable<BuildNextOptions['mask']>
    >()
    expectTypeOf<
      InheritedMask & { routeTree: typeof routeTree; from: '/' }
    >().toMatchTypeOf<RouteMask<typeof routeTree>>()
  })

  test('infers an explicit inherited mask in a native navigation call', () => {
    const result = router.navigate({
      from: '/',
      to: '/',
      mask: {
        to: '/visible/$id',
        params: { id: '42' },
        inheritSearch: true,
      },
    })
    expectTypeOf(result).toEqualTypeOf<Promise<void>>()

    const conflictingMask = {
      to: '/visible/$id' as const,
      params: { id: '42' },
      inheritSearch: true as const,
      search: { required: 'value' },
    }
    router.navigate({
      from: '/',
      to: '/',
      // @ts-expect-error An inherited mask cannot supply separate search input.
      mask: conflictingMask,
    })
  })

  test('contextually types configured inherited masks at router creation', () => {
    const configured = createTestRouter({
      routeTree,
      routeMasks: [
        {
          routeTree,
          from: '/',
          to: '/visible/$id',
          params: { id: '42' },
          inheritSearch: true,
        },
      ],
    })
    expectTypeOf(configured.routeTree).toEqualTypeOf<typeof routeTree>()

    const conflictingMask = {
      routeTree,
      from: '/' as const,
      to: '/visible/$id',
      params: { id: '42' },
      inheritSearch: true as const,
      search: { required: 'value' },
    }
    createTestRouter({
      routeTree,
      routeMasks: [
        // @ts-expect-error Configured masks have the same exclusive search contract.
        conflictingMask,
      ],
    })
  })
})
