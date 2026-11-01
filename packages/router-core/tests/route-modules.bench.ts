import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
import type { AnyRoute, AnyRouter, GetStoreConfig } from '../src'

// Keep this file identical in baseline/candidate checkouts. Nx must build each
// revision first. Native modules avoid Vitest's instrumented export getters
// inside the timed routing code. The build paths also predate _internal exports.
const require = createRequire(import.meta.url)
const {
  BaseRootRoute,
  BaseRoute,
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} = require('../dist/cjs/index.cjs') as typeof import('../src')
const moduleWiring =
  require('../dist/cjs/route-module.cjs') as typeof import('../src/route-module')
const { createMemoryHistory } =
  require('@tanstack/history') as typeof import('@tanstack/history')

const getStoreConfig: GetStoreConfig = () => ({
  createMutableStore: createNonReactiveMutableStore,
  createReadonlyStore: createNonReactiveReadonlyStore,
  batch: (fn) => fn(),
})

const BATCH = 64
const MODULE = '@bench/catalog'

type LocationOptions = {
  to: string
  params: Record<string, string>
  _module?: string
  _nearestRoute?: string
}

function createModuleTree() {
  // This is the core half of generated createModuleRoot: the namespace enters
  // through construction options, never by mutating initialized route metadata.
  const root = new BaseRoute({ _module: MODULE } as any) as AnyRoute
  return root.addChildren([
    new BaseRoute({ getParentRoute: () => root, path: '/$itemId' }),
  ]) as AnyRoute
}

function createRouter(kind: 'ordinary' | 'singleton' | 'repeated') {
  const root = new BaseRootRoute({})
  const org = new BaseRoute({
    getParentRoute: () => root,
    path: '/orgs/$orgId',
  })
  const user = new BaseRoute({
    getParentRoute: () => root,
    path: '/users/$userId',
  })
  let children: Array<AnyRoute>
  if (kind === 'ordinary') {
    children = [
      org.addChildren([
        new BaseRoute({ getParentRoute: () => org, path: '/catalog/$itemId' }),
      ]),
    ]
  } else {
    const module = createModuleTree()
    const orgCatalog = moduleWiring.mountRouteModule(module, {
      parent: () => org,
      at: '/catalog',
      ...(kind === 'repeated' ? { as: 'orgCatalog' } : {}),
    } as any)
    children = [org.addChildren([orgCatalog])]
    if (kind === 'repeated') {
      children.push(
        user.addChildren([
          moduleWiring.mountRouteModule(module, {
            parent: () => user,
            at: '/catalog',
            as: 'userCatalog',
          } as any),
        ]),
      )
    }
  }
  const history = createMemoryHistory({
    initialEntries: ['/orgs/acme/catalog/0'],
  })
  const router = new RouterCore(
    {
      routeTree: root.addChildren(children),
      history,
      scrollRestoration: false,
      isServer: true,
    },
    getStoreConfig,
  )
  history.destroy()
  return router
}

const ordinary = createRouter('ordinary')
const singleton = createRouter('singleton')
const repeated = createRouter('repeated')
const orgView = moduleWiring.getScopedRouterView(
  repeated,
  `${MODULE}#orgCatalog`,
)
const userView = moduleWiring.getScopedRouterView(
  repeated,
  `${MODULE}#userCatalog`,
)

const ordinaryOptions: Array<LocationOptions> = Array.from(
  { length: BATCH },
  (_, index) => ({
    to: '/orgs/$orgId/catalog/$itemId',
    params: { orgId: 'acme', itemId: String(index) },
  }),
)
const singletonOptions = ordinaryOptions.map((options) => ({
  ...options,
  to: '/$itemId',
  _module: MODULE,
}))
const repeatedOptions = singletonOptions.map((options, index) => ({
  ...options,
  params: { orgId: 'acme', userId: 'alex', itemId: String(index) },
  _nearestRoute: `${MODULE}#${index % 2 ? 'userCatalog' : 'orgCatalog'}:/$itemId`,
}))
const reusableOptions = repeatedOptions.map((options, index) => ({
  ...options,
  _module: `${MODULE}#${index % 2 ? 'userCatalog' : 'orgCatalog'}`,
}))

// Use the same factories that back generated redirect exports on both
// revisions. The nested call creates the candidate's deferred constraint;
// no private constraint object is constructed or injected by the benchmark.
const moduleRedirect = moduleWiring.createScopedRedirect(MODULE)
const installationRedirects = [
  moduleWiring.createScopedRedirect(`${MODULE}#orgCatalog`),
  moduleWiring.createScopedRedirect(`${MODULE}#userCatalog`),
]
const deferredRedirectOptions = repeatedOptions.map(
  (options, index) =>
    moduleRedirect(
      installationRedirects[index % 2]!({
        to: '/$itemId',
        params: options.params,
      } as any).options as any,
    ).options,
)

// Route.redirect supplies its authored origin itself. Resolve these actual
// redirect options through buildLocation, as a router does for navigation.
const routeBoundRedirectOptions = repeatedOptions.map((options, index) => {
  const installation = index % 2 ? 'userCatalog' : 'orgCatalog'
  const route = repeated.routesById[
    `${MODULE}#${installation}:/$itemId`
  ] as AnyRoute
  return route.redirect({ to: '.', params: options.params } as any).options
})

const orgHref = (index: number) => `/orgs/acme/catalog/${index}`
const repeatedHref = (index: number) =>
  index % 2 ? `/users/alex/catalog/${index}` : orgHref(index)

function defineCase(
  name: string,
  operation: (index: number) => string,
  expected: (index: number) => string,
) {
  let expectedChecksum = 0
  for (let index = 0; index < BATCH; index++) {
    expect(operation(index)).toBe(expected(index))
    expectedChecksum += expected(index).length
  }
  let checksum = 0
  test(name, async ({ bench }) => {
    await bench(
      name,
      {
        afterAll: () => {
          expect(checksum).toBe(expectedChecksum)
        },
      },
      () => {
        checksum = 0
        for (let index = 0; index < BATCH; index++) {
          checksum += operation(index).length
        }
      },
    ).run({ time: 1500, warmupTime: 500, throws: true })
  })
}

// This accepted bug fix deliberately differs from the baseline. Validate it
// outside timing when that implementation is present; all measured operations
// below are identical valid public API workloads on both revisions.
if ('bindRouteScopeOptions' in moduleWiring) {
  expect(() => orgView.buildLocation(reusableOptions[1] as any)).toThrow()
}

const build = (router: Pick<AnyRouter, 'buildLocation'>, options: object) =>
  router.buildLocation(options as any).href

describe(`route-module location resolution (${BATCH} calls)`, () => {
  defineCase(
    'ordinary application destinations',
    (index) => build(ordinary, ordinaryOptions[index]!),
    orgHref,
  )
  defineCase(
    'singleton module-local destinations',
    (index) => build(singleton, singletonOptions[index]!),
    orgHref,
  )
  defineCase(
    'repeated module-local destinations from alternating callers',
    (index) => build(repeated, repeatedOptions[index]!),
    repeatedHref,
  )
  defineCase(
    'same-scope reusable options through explicit router views',
    (index) => build(index % 2 ? userView : orgView, reusableOptions[index]!),
    repeatedHref,
  )
  defineCase(
    'deferred redirect scope constraints through explicit router views',
    (index) =>
      build(index % 2 ? userView : orgView, deferredRedirectOptions[index]!),
    repeatedHref,
  )
  defineCase(
    'route-bound redirect origin rebinding',
    (index) => build(repeated, routeBoundRedirectOptions[index]!),
    repeatedHref,
  )
  defineCase(
    'mixed ordinary, singleton, repeated, and reusable destinations',
    (index) => {
      switch (index % 4) {
        case 0:
          return build(ordinary, ordinaryOptions[index]!)
        case 1:
          return build(singleton, singletonOptions[index]!)
        case 2:
          return build(repeated, repeatedOptions[index]!)
        default:
          return build(userView, reusableOptions[index]!)
      }
    },
    (index) => (index % 4 === 3 ? repeatedHref(index) : orgHref(index)),
  )
  defineCase(
    'mixed application, scoped, deferred, and route-bound destinations',
    (index) => {
      switch (index % 6) {
        case 0:
          return build(ordinary, ordinaryOptions[index]!)
        case 1:
          return build(singleton, singletonOptions[index]!)
        case 2:
          return build(repeated, repeatedOptions[index]!)
        case 3:
          return build(userView, reusableOptions[index]!)
        case 4:
          return build(orgView, deferredRedirectOptions[index]!)
        default:
          return build(repeated, routeBoundRedirectOptions[index]!)
      }
    },
    (index) => (index % 6 >= 2 ? repeatedHref(index) : orgHref(index)),
  )
})

describe(`route-module match construction (${BATCH} calls)`, () => {
  defineCase(
    'ordinary application matches',
    (index) => ordinary.matchRoutes(orgHref(index)).at(-1)!.routeId,
    () => '/orgs/$orgId/catalog/$itemId',
  )
  defineCase(
    'repeated installation matches',
    (index) => repeated.matchRoutes(repeatedHref(index)).at(-1)!.routeId,
    (index) => `${MODULE}#${index % 2 ? 'userCatalog' : 'orgCatalog'}:/$itemId`,
  )
})

// These focused cases compare the accepted implementation with an optional
// optimization. The original baseline has no binder, so retain the ten shared
// workloads above and omit this group there.
if ('bindRouteScopeOptions' in moduleWiring) {
  const bind = moduleWiring.bindRouteScopeOptions as (
    moduleId: string,
    options: object,
    router: AnyRouter,
    nearestRouteId: string,
  ) => { _module: unknown }
  const installation = (index: number) =>
    `${MODULE}#${index % 2 ? 'userCatalog' : 'orgCatalog'}`
  // Resolve callers from actual matches, as the framework bindings do. Keep
  // match construction outside timing to isolate the binding operation.
  const nearestRouteIds = Array.from({ length: BATCH }, (_, index) => {
    const routeId = repeated.matchRoutes(repeatedHref(index)).at(-1)!.routeId
    expect(routeId).toBe(`${installation(index)}:/$itemId`)
    return routeId
  })
  const localOptions = repeatedOptions.map(({ params }) => ({
    to: '/$itemId',
    params,
  }))
  const installedRedirectOptions = localOptions.map(
    (options, index) =>
      installationRedirects[index % 2]!(options as any).options,
  )
  const bindScope = (moduleId: string, options: object, index: number) =>
    bind(moduleId, options, repeated, nearestRouteIds[index]!)._module as string

  describe(`route-module scope binding (${BATCH} calls, candidate only)`, () => {
    // defineCase asserts each concrete returned installation before timing,
    // then checksums the same returned value during every timed batch.
    defineCase(
      'deferred redirect constraints through module receivers',
      (index) => bindScope(MODULE, deferredRedirectOptions[index]!, index),
      installation,
    )
    defineCase(
      'deferred redirect constraints through named receivers',
      (index) =>
        bindScope(installation(index), deferredRedirectOptions[index]!, index),
      installation,
    )
    defineCase(
      'installed redirect options through module receivers',
      (index) => bindScope(MODULE, installedRedirectOptions[index]!, index),
      installation,
    )
    defineCase(
      'module-local options through module receivers',
      (index) => bindScope(MODULE, localOptions[index]!, index),
      () => MODULE,
    )
  })
}
