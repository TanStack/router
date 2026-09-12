import { expectTypeOf, test } from 'vitest'
import { createFileRoute, createRootRoute, createRoute } from '../src'
import type {
  AnyRoute,
  StaticDataByRouteId,
  StaticDataRouteOption,
  UpdatableStaticRouteOptionByRouteId,
} from '../src'

interface PillarStaticData {
  layout: 'pillar'
  collapsible?: boolean
}

interface DetailStaticData {
  layout: 'detail'
  backTo: string
}

interface NestedStaticData {
  layout: 'nested'
  depth: number
}

declare module '@tanstack/router-core' {
  interface StaticDataByRoutePrefix {
    '/_staticPillar': PillarStaticData
    '/_staticDetail': DetailStaticData
    '/_staticPillar/nested': NestedStaticData
  }
}

const rootRoute = createRootRoute()

const pillarRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_staticPillar',
  staticData: { layout: 'pillar' },
})

const pillarFileRoute = createFileRoute('/_staticPillar')()

const pillarFileChildRoute = createFileRoute('/_staticPillar/dashboard')({
  staticData: { layout: 'pillar', collapsible: true },
})

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/_staticPillar': {
      preLoaderRoute: typeof pillarFileRoute
      parentRoute: typeof rootRoute
      id: '/_staticPillar'
      fullPath: string
      path: string
    }
    '/_staticPillar/dashboard': {
      preLoaderRoute: typeof pillarFileChildRoute
      parentRoute: typeof pillarFileRoute
      id: '/_staticPillar/dashboard'
      fullPath: '/dashboard'
      path: '/dashboard'
    }
  }
}

test('StaticDataByRouteId maps a route id to its registered prefix shape', () => {
  expectTypeOf<
    StaticDataByRouteId<'/_staticPillar'>
  >().toEqualTypeOf<PillarStaticData>()
  expectTypeOf<
    StaticDataByRouteId<'/_staticPillar/dashboard'>
  >().toEqualTypeOf<PillarStaticData>()
  expectTypeOf<
    StaticDataByRouteId<'/_staticDetail/settings/profile'>
  >().toEqualTypeOf<DetailStaticData>()
})

test('StaticDataByRouteId only matches whole path segments', () => {
  expectTypeOf<
    StaticDataByRouteId<'/_staticPillarExtra'>
  >().toEqualTypeOf<StaticDataRouteOption>()
})

test('StaticDataByRouteId falls back to StaticDataRouteOption when no prefix matches', () => {
  expectTypeOf<
    StaticDataByRouteId<'/unrelated'>
  >().toEqualTypeOf<StaticDataRouteOption>()
})

test('overlapping registered prefixes union their shapes', () => {
  expectTypeOf<StaticDataByRouteId<'/_staticPillar/nested'>>().toEqualTypeOf<
    PillarStaticData | NestedStaticData
  >()
  expectTypeOf<
    StaticDataByRouteId<'/_staticPillar/nested/leaf'>
  >().toEqualTypeOf<PillarStaticData | NestedStaticData>()

  createRoute({
    getParentRoute: () => pillarRoute,
    path: 'nested/leaf',
    staticData: { layout: 'nested', depth: 1 },
  })

  createRoute({
    getParentRoute: () => pillarRoute,
    path: 'nested/leaf',
    staticData: { layout: 'pillar' },
  })

  createRoute({
    getParentRoute: () => pillarRoute,
    path: 'nested/leaf',
    // @ts-expect-error neither registered shape allows DetailStaticData
    staticData: { layout: 'detail', backTo: '/' },
  })
})

test('code-based routes type staticData by the registered prefix of their id', () => {
  expectTypeOf(pillarRoute.id).toEqualTypeOf<'/_staticPillar'>()

  const dashboardRoute = createRoute({
    getParentRoute: () => pillarRoute,
    path: 'dashboard',
    staticData: { layout: 'pillar', collapsible: true },
  })

  expectTypeOf(dashboardRoute.id).toEqualTypeOf<'/_staticPillar/dashboard'>()

  createRoute({
    getParentRoute: () => pillarRoute,
    path: 'reports',
    // @ts-expect-error a route under `/_staticPillar` must use PillarStaticData
    staticData: { layout: 'detail', backTo: '/' },
  })

  // presence stays optional under a prefix, even with required properties
  createRoute({
    getParentRoute: () => pillarRoute,
    path: 'metrics',
  })
})

test('update() types staticData by the registered prefix of the route id', () => {
  pillarRoute.update({ staticData: { layout: 'pillar' } })

  pillarRoute.update({
    // @ts-expect-error a route under `/_staticPillar` must use PillarStaticData
    staticData: { layout: 'detail', backTo: '/' },
  })
})

test('update() keeps the StaticDataRouteOption behavior outside registered prefixes', () => {
  const legalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'legal',
  })

  legalRoute.update({ staticData: { anything: 'goes' } })
})

test('a matching prefix replaces the staticData option instead of intersecting it', () => {
  // exactly the registered shape, not `StaticDataRouteOption & <shape>`
  expectTypeOf<
    Parameters<typeof pillarRoute.update>[0]['staticData']
  >().toEqualTypeOf<PillarStaticData | undefined>()

  const legalRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'legal',
  })

  expectTypeOf<
    Parameters<typeof legalRoute.update>[0]['staticData']
  >().toEqualTypeOf<StaticDataRouteOption | undefined>()

  // That a prefix also lifts a *required* `StaticDataRouteOption`
  // augmentation (the "Enforcing Static Data" pattern) cannot be asserted
  // here: augmenting that interface would leak into every other test of
  // this shared tsconfig project, so that case is pinned only by the
  // implementation of `UpdatableStaticRouteOptionByRouteId`.
})

test('file-based routes type staticData by the registered prefix of their id', () => {
  expectTypeOf(
    pillarFileChildRoute.id,
  ).toEqualTypeOf<'/_staticPillar/dashboard'>()

  createFileRoute('/_staticPillar/dashboard')({
    // @ts-expect-error a route under `/_staticPillar` must use PillarStaticData
    staticData: { layout: 'detail', backTo: '/' },
  })

  // presence stays optional under a prefix, even with required properties
  createFileRoute('/_staticPillar/dashboard')({})
})

test('routes outside any registered prefix keep the StaticDataRouteOption behavior', () => {
  const aboutRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'about',
    staticData: { anything: 'goes' },
  })

  expectTypeOf(aboutRoute.id).toEqualTypeOf<'/about'>()
})

test('non-literal route ids type staticData permissively once a prefix is registered', () => {
  // Wide instantiations such as `AnyRoute` cover prefixed routes (optional,
  // prefix-shaped staticData) and unprefixed routes (StaticDataRouteOption)
  // at once, so non-literal ids widen to `{ staticData?: any }`.
  expectTypeOf<UpdatableStaticRouteOptionByRouteId<string>>().toEqualTypeOf<{
    staticData?: any
  }>()

  // ...which keeps prefixed and unprefixed routes assignable to AnyRoute.
  const routes: Array<AnyRoute> = [rootRoute, pillarRoute, pillarFileChildRoute]
  expectTypeOf(routes).toEqualTypeOf<Array<AnyRoute>>()
})
