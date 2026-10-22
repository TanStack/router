import { expectTypeOf, test } from 'vitest'
import {
  createFileRoute,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
import { createIsomorphicFn } from '@tanstack/start-client-core'
import { createRouterConfig } from '@tanstack/router-core'
import type { LifecycleNoWire } from '@tanstack/router-core'

const config = createRouterConfig({ defaultSsr: 'data-only' })

declare module '@tanstack/router-core' {
  interface Register {
    ssr: true
    config: typeof config
  }
}

test('a data-only loader infers required client data from its client implementation', () => {
  const root = createRootRoute()
  const handler = createIsomorphicFn()
    .server(async () => ({ count: 1 }))
    .client(async () => ({ count: 1, ready: true }))
  const route = createRoute({
    getParentRoute: () => root,
    path: 'phased',
    ssr: 'data-only',
    loader: {
      handler,
      dehydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ count: number }>()
        return { count: data.count }
      },
      hydrate: ({ data }) => ({ ...data, ready: true }),
    },
  })
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
  const router = createRouter({ routeTree: root.addChildren([route]) })
  route.useLoaderData<typeof router>({
    select: (data) => {
      expectTypeOf(data).toEqualTypeOf<{ count: number; ready: boolean }>()
      return data.ready
    },
  })
})

test('all lifecycle slots retain their client contract and server codec input', () => {
  const root = createRootRoute({ ssr: 'data-only' })
  const contextHandler = createIsomorphicFn()
    .client(async () => ({ locale: 'en', browser: true }))
    .server(async () => ({ locale: 'en' }))
  const beforeLoadHandler = createIsomorphicFn()
    .server(() => ({ user: 'user' }))
    .client(() => ({ user: 'user', authenticated: true }))
  const loaderHandler = createIsomorphicFn()
    .server(() => ({ count: 1 }))
    .client(() => ({ count: 1, ready: true }))
  const route = createRoute({
    getParentRoute: () => root,
    path: 'all',
    ssr: true,
    context: {
      handler: contextHandler,
      dehydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ locale: string }>()
        return data.locale
      },
      hydrate: ({ data }) => ({ locale: data, browser: true }),
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { locale: string; browser: boolean } | undefined
        >()
        return { locale: prev?.locale ?? 'en', browser: true }
      },
    },
    beforeLoad: {
      handler: beforeLoadHandler,
      dehydrate: true,
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ user: string }>()
        expectTypeOf(context.locale).toEqualTypeOf<string>()
        return { user: data.user, authenticated: true }
      },
    },
    loader: {
      handler: loaderHandler,
      dehydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ count: number }>()
        expectTypeOf(context.user).toEqualTypeOf<string>()
        return data.count
      },
      hydrate: ({ data }) => ({ count: data, ready: true }),
    },
    head: ({ loaderData, match }) => {
      expectTypeOf(loaderData?.count).toEqualTypeOf<number | undefined>()
      expectTypeOf(match.context.locale).toEqualTypeOf<string>()
      return {}
    },
  })
  expectTypeOf(route.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(route.types.routeContextFn).toEqualTypeOf(contextHandler)
  expectTypeOf(route.types.beforeLoadFn).toEqualTypeOf(beforeLoadHandler)
  expectTypeOf(route.types.allContext).toMatchTypeOf<{
    locale: string
    browser: boolean
    user: string
    authenticated: boolean
  }>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
  const child = createRoute({
    getParentRoute: () => route,
    path: 'child',
    loader: ({ context }) => {
      expectTypeOf(context.locale).toEqualTypeOf<string>()
      expectTypeOf(context.user).toEqualTypeOf<string>()
      return context.user
    },
  })
  expectTypeOf(child.types.allContext).toEqualTypeOf(route.types.allContext)
})

test('functional policies allow partial server values only when rendering is impossible', () => {
  const root = createRootRoute({ ssr: true })
  const handler = createIsomorphicFn()
    .server(() => ({ count: 1 }))
    .client(() => ({ count: 1, ready: true }))
  const codec = {
    handler,
    dehydrate: true as const,
    hydrate: ({ data }: { data: { count: number } }) => ({
      ...data,
      ready: true,
    }),
  }
  const sync = createRoute({
    getParentRoute: () => root,
    path: 'sync',
    ssr: () => 'data-only',
    loader: codec,
  })
  const async = createRoute({
    getParentRoute: () => root,
    path: 'async',
    ssr: async () => 'data-only' as const,
    loader: codec,
  })
  const disabledRoot = createRootRoute({ ssr: false })
  const disabledChild = createRoute({
    getParentRoute: () => disabledRoot,
    path: 'disabled-child',
    ssr: true,
    loader: handler,
  })
  expectTypeOf(sync.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
  expectTypeOf(async.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
  expectTypeOf(sync.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(async.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(disabledChild.types.allSsr).toEqualTypeOf<false>()
  expectTypeOf(disabledChild.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()

  createRoute({
    getParentRoute: () => root,
    path: 'rendered',
    ssr: true,
    // @ts-expect-error server rendering requires the client handler's fields
    loader: codec,
  })
  createRoute({
    getParentRoute: () => root,
    path: 'possibly-rendered',
    ssr: () => (Math.random() > 0.5 ? true : 'data-only'),
    // @ts-expect-error a policy that may render still requires the client contract
    loader: codec,
  })
})

test('hydration and subsequent client execution produce the same required fields', () => {
  const root = createRootRoute({ ssr: 'data-only' })
  const handler = createIsomorphicFn()
    .server(() => ({ count: 1 }))
    .client(() => ({ count: 1, ready: true }))
  const incompleteCodec = {
    handler,
    dehydrate: () => 1,
    hydrate: () => ({ count: 1 }),
  }
  createRoute({
    getParentRoute: () => root,
    path: 'incomplete-hydration',
    // @ts-expect-error hydrate must satisfy the client handler's inferred result
    loader: incompleteCodec,
  })
  createRoute({
    getParentRoute: () => root,
    path: 'untransformed',
    // @ts-expect-error partial raw server data needs hydration before client consumption
    loader: { handler, dehydrate: true },
  })
  createRoute({
    getParentRoute: () => root,
    path: 'default-transport',
    // @ts-expect-error default raw transport cannot create the required client fields
    loader: handler,
  })
})

test('raw transport validates only the server result', () => {
  const root = createRootRoute({ ssr: 'data-only' })
  const route = createRoute({
    getParentRoute: () => root,
    path: 'client-function',
    loader: {
      handler: createIsomorphicFn()
        .server(() => ({ count: 1 }))
        .client(() => ({ count: 1, read: () => Math.random() > 0.5 })),
      dehydrate: true,
      hydrate: ({ data }) => ({ ...data, read: () => Math.random() > 0.5 }),
    },
  })
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    count: number
    read: () => boolean
  }>()
})

const fileRoot = createRootRoute({ ssr: 'data-only' })
declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/phased-file': {
      id: '/phased-file'
      path: '/phased-file'
      fullPath: '/phased-file'
      parentRoute: typeof fileRoot
      preLoaderRoute: typeof fileRoute
    }
  }
}
const fileRoute = createFileRoute('/phased-file')({
  ssr: true,
  loader: {
    handler: createIsomorphicFn()
      .client(async () => ({ count: 1, ready: true }))
      .server(async () => ({ count: 1 })),
    dehydrate: ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ count: number }>()
      return data.count
    },
    hydrate: async ({ data }) => ({ count: data, ready: true }),
  },
})
test('file routes preserve inline phase inference and inherited rendering restrictions', () => {
  expectTypeOf(fileRoute.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(fileRoute.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
  const router = createRouter({ routeTree: fileRoot.addChildren([fileRoute]) })
  fileRoute.useLoaderData<typeof router>({
    select: (data) => {
      expectTypeOf(data.ready).toEqualTypeOf<boolean>()
      return data.count
    },
  })
})

test('server-rendered routes accept a server result that satisfies the client type', () => {
  const root = createRootRoute({ ssr: true })
  const route = createRoute({
    getParentRoute: () => root,
    path: 'rendered-compatible',
    ssr: async () => true as const,
    loader: {
      handler: createIsomorphicFn()
        .server(async () => ({ count: 1, ready: true, serverOnly: 'extra' }))
        .client(async () => ({ count: 1, ready: true })),
      dehydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{
          count: number
          ready: boolean
          serverOnly: string
        }>()
        return data.count
      },
      hydrate: ({ data }) => ({ count: data, ready: true }),
    },
  })
  expectTypeOf(route.types.allSsr).toEqualTypeOf<true>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
})

test('a callable lifecycle retains its own result when it also has a handler property', () => {
  const root = createRootRoute({ ssr: 'data-only' })
  const handler = Object.assign(
    createIsomorphicFn()
      .server(() => ({ count: 1 }))
      .client(() => ({ count: 1, ready: true })),
    { handler: () => 'another function' },
  )
  const route = createRoute({
    getParentRoute: () => root,
    path: 'callable-property',
    loader: { handler, dehydrate: false },
  })
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
})

test('phase metadata does not bypass serialization of unknown server results', () => {
  const root = createRootRoute({ ssr: 'data-only' })
  const codec = {
    handler: createIsomorphicFn()
      .server((): unknown => ({ count: 1 }))
      .client(() => ({ count: 1 })),
    dehydrate: true as const,
    hydrate: () => ({ count: 1 }),
  }
  createRoute({
    getParentRoute: () => root,
    path: 'unknown-server',
    // @ts-expect-error an unknown server result cannot use raw transport
    loader: codec,
  })
})

test('hydration accepts stable object, callable, and nested thenables', () => {
  const root = createRootRoute()
  const object = createRoute({
    getParentRoute: () => root,
    path: 'object-thenable',
    loader: {
      handler: () => ({ count: 1 }),
      dehydrate: () => 1,
      hydrate: ({ data }) => ({
        then(
          resolve: (value: { count: number }) => void,
          _reject: (reason: any) => void,
        ) {
          resolve({ count: data })
        },
      }),
    },
  })
  const callable = Object.assign(() => undefined, {
    then(resolve: (value: { count: number }) => void) {
      resolve({ count: 1 })
    },
  })
  const functionRoute = createRoute({
    getParentRoute: () => root,
    path: 'callable-thenable',
    loader: {
      handler: () => ({ count: 1 }),
      dehydrate: () => 1,
      hydrate: () => callable,
    },
  })
  const nested = createRoute({
    getParentRoute: () => root,
    path: 'nested-thenable',
    loader: {
      handler: () => ({ count: 1 }),
      dehydrate: () => 1,
      hydrate: ({ data }) => ({
        then(resolve) {
          resolve({
            then(resolveInner) {
              resolveInner({ count: data })
            },
          })
        },
      }),
    },
  })
  const incomplete = {
    handler: () => ({ count: 1, ready: true }),
    dehydrate: () => 1,
    hydrate: () => ({
      then(resolve: (value: { count: number }) => void) {
        resolve({ count: 1 })
      },
    }),
  }
  createRoute({
    getParentRoute: () => root,
    path: 'incomplete-thenable',
    // @ts-expect-error fulfilled data must satisfy the client handler result
    loader: incomplete,
  })
  expectTypeOf(object.types.loaderData).toEqualTypeOf<{ count: number }>()
  expectTypeOf(functionRoute.types.loaderData).toEqualTypeOf<{
    count: number
  }>()
  expectTypeOf(nested.types.loaderData).toEqualTypeOf<{ count: number }>()
})

test('registered SSR defaults apply before inherited rendering restrictions', () => {
  const root = createRootRoute()
  const renderedRoot = createRootRoute({ ssr: true })
  const codec = {
    handler: createIsomorphicFn()
      .server(() => ({ count: 1 }))
      .client(() => ({ count: 1, ready: true })),
    dehydrate: true as const,
    hydrate: ({ data }: { data: { count: number } }) => ({
      ...data,
      ready: true,
    }),
  }
  const capped = createRoute({
    getParentRoute: () => root,
    path: 'configured-cap',
    ssr: true,
    loader: codec,
  })
  const omitted = createRoute({
    getParentRoute: () => renderedRoot,
    path: 'configured-omitted',
    loader: codec,
  })
  const functional = createRoute({
    getParentRoute: () => renderedRoot,
    path: 'configured-functional',
    ssr: () => undefined,
    loader: codec,
  })
  const async = createRoute({
    getParentRoute: () => renderedRoot,
    path: 'configured-async',
    ssr: async () => undefined,
    loader: codec,
  })
  expectTypeOf(root.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(capped.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(omitted.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(functional.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(async.types.allSsr).toEqualTypeOf<'data-only'>()
  expectTypeOf(capped.types.loaderData).toEqualTypeOf<{
    count: number
    ready: boolean
  }>()
})

test('an explicit SSR override validates data despite a disabled registered default', () => {
  const disabledConfig = createRouterConfig({ defaultSsr: false })
  type DisabledRegister = { ssr: true; config: typeof disabledConfig }
  const disabled = createRootRoute<DisabledRegister>()
  expectTypeOf(disabled.types.allSsr).toEqualTypeOf<false>()
  const handler = () => ({ read: () => 1 })
  const rendered = createRootRoute<
    DisabledRegister,
    undefined,
    {},
    {},
    {},
    {},
    typeof handler,
    true
  >({
    ssr: true,
    // @ts-expect-error explicitly enabled SSR must validate the transported value
    loader: handler,
  })
  expectTypeOf(rendered.types.allSsr).toEqualTypeOf<true>()
  const child = createRoute<
    DisabledRegister,
    typeof rendered,
    'disabled-default-child'
  >({
    getParentRoute: () => rendered,
    path: 'disabled-default-child',
  })
  expectTypeOf(child.types.allSsr).toEqualTypeOf<false>()

  const codecHandler = () => ({ count: 1 })
  const wire = () => ({ read: () => 1 })
  const codec = {
    handler: codecHandler,
    dehydrate: wire,
    hydrate: () => ({ count: 1 }),
  }
  createRootRoute<
    DisabledRegister,
    undefined,
    {},
    {},
    {},
    {},
    typeof codecHandler,
    true,
    undefined,
    LifecycleNoWire,
    LifecycleNoWire,
    ReturnType<typeof wire>
  >({
    ssr: true,
    // @ts-expect-error explicitly enabled SSR must validate the custom wire too
    loader: codec,
  })
})
