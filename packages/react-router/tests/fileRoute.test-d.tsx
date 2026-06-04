import { expectTypeOf, test } from 'vitest'
import { Link, createFileRoute, createRootRoute, createRouter } from '../src'
import type { AnyRouteMatch } from '@tanstack/router-core'

const rootRoute = createRootRoute()

const indexRoute = createFileRoute('/')()

const invoicesRoute = createFileRoute('/invoices')()

const invoiceRoute = createFileRoute('/invoices/$invoiceId')()

const postLayoutRoute = createFileRoute('/_postLayout')()

const postsRoute = createFileRoute('/_postLayout/posts')()

const postRoute = createFileRoute('/_postLayout/posts/$postId_')()

const protectedRoute = createFileRoute('/(auth)/protected')()

const optionalSearchRoute = createFileRoute('/optional-search')({
  validateSearch: (): { preload?: false } => ({}),
})

const optionalSearchIndexRoute = createFileRoute('/optional-search/')()

const optionalSearchChildRoute = createFileRoute('/optional-search/child')()

const attachmentRoute = createFileRoute(
  '/projects/$observationDocId/attachments/$driveId/$type/$variant/$name',
)({
  params: {
    parse: ({ driveId, type, variant, name, ...rest }) => {
      const blobId =
        type === 'audio'
          ? {
              type: 'audio' as const,
              variant: 'original' as const,
              driveId,
              name,
            }
          : {
              type: 'photo' as const,
              variant: variant as 'original' | 'preview' | 'thumbnail',
              driveId,
              name,
            }

      return { ...rest, ...blobId }
    },
  },
})

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof indexRoute
      parentRoute: typeof rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/(auth)/protected': {
      preLoaderRoute: typeof protectedRoute
      parentRoute: typeof rootRoute
      id: '/protected'
      fullPath: '/protected'
      path: '(auth)/protected'
    }
    '/optional-search': {
      preLoaderRoute: typeof optionalSearchRoute
      parentRoute: typeof rootRoute
      id: '/optional-search'
      fullPath: '/optional-search'
      path: '/optional-search'
    }
    '/optional-search/': {
      preLoaderRoute: typeof optionalSearchIndexRoute
      parentRoute: typeof optionalSearchRoute
      id: '/optional-search/'
      fullPath: '/optional-search/'
      path: '/'
    }
    '/optional-search/child': {
      preLoaderRoute: typeof optionalSearchChildRoute
      parentRoute: typeof optionalSearchRoute
      id: '/optional-search/child'
      fullPath: '/optional-search/child'
      path: '/child'
    }
    '/invoices': {
      preLoaderRoute: typeof invoicesRoute
      parentRoute: typeof indexRoute
      id: '/invoices'
      fullPath: '/invoices'
      path: 'invoices'
    }
    '/invoices/$invoiceId': {
      preLoaderRoute: typeof invoiceRoute
      parentRoute: typeof invoicesRoute
      id: '/invoices/$invoiceId'
      fullPath: '/invoices/$invoiceId'
      path: '/$invoiceId'
    }
    '/_postLayout': {
      preLoaderRoute: typeof postLayoutRoute
      parentRoute: typeof rootRoute
      id: string
      fullPath: string
      path: string
    }
    '/_postLayout/posts': {
      preLoaderRoute: typeof postsRoute
      parentRoute: typeof postLayoutRoute
      id: '/_postLayout/posts'
      fullPath: '/posts'
      path: '/posts'
    }
    '/_postLayout/posts/$postId_': {
      preLoaderRoute: typeof postRoute
      parentRoute: typeof postsRoute
      id: '/_postLayout/posts/$postId_'
      fullPath: '/posts/$postId'
      path: '/$postId_'
    }
    '/projects/$observationDocId/attachments/$driveId/$type/$variant/$name': {
      preLoaderRoute: typeof attachmentRoute
      parentRoute: typeof rootRoute
      id: '/projects/$observationDocId/attachments/$driveId/$type/$variant/$name'
      fullPath: '/projects/$observationDocId/attachments/$driveId/$type/$variant/$name'
      path: '/projects/$observationDocId/attachments/$driveId/$type/$variant/$name'
    }
  }
}

interface OptionalSearchFileRoutesByFullPath {
  '/optional-search': typeof optionalSearchRouteWithChildren
  '/optional-search/': typeof optionalSearchIndexRoute
  '/optional-search/child': typeof optionalSearchChildRoute
}

interface OptionalSearchFileRoutesByTo {
  '/optional-search': typeof optionalSearchIndexRoute
  '/optional-search/child': typeof optionalSearchChildRoute
}

interface OptionalSearchFileRoutesById {
  '/optional-search': typeof optionalSearchRouteWithChildren
  '/optional-search/': typeof optionalSearchIndexRoute
  '/optional-search/child': typeof optionalSearchChildRoute
}

interface OptionalSearchFileRouteTypes {
  fileRoutesByFullPath: OptionalSearchFileRoutesByFullPath
  fullPaths: '/optional-search' | '/optional-search/' | '/optional-search/child'
  to: '/optional-search' | '/optional-search/child'
  fileRoutesByTo: OptionalSearchFileRoutesByTo
  id: '/optional-search' | '/optional-search/' | '/optional-search/child'
  fileRoutesById: OptionalSearchFileRoutesById
}

const optionalSearchRouteWithChildren = optionalSearchRoute._addFileChildren({
  OptionalSearchIndexRoute: optionalSearchIndexRoute,
  OptionalSearchChildRoute: optionalSearchChildRoute,
})

const fileRouteTree = rootRoute
  ._addFileChildren({
    OptionalSearchRoute: optionalSearchRouteWithChildren,
  })
  ._addFileTypes<OptionalSearchFileRouteTypes>()

const fileRouter = createRouter({
  routeTree: fileRouteTree,
})

type FileRouter = typeof fileRouter

test('when creating a file route with a static route', () => {
  expectTypeOf<'/invoices'>(invoicesRoute.fullPath)
  expectTypeOf<'/invoices'>(invoicesRoute.id)
  expectTypeOf<'invoices'>(invoicesRoute.path)
})

test('when creating a file route with params', () => {
  expectTypeOf<'/invoices/$invoiceId'>(invoiceRoute.fullPath)
  expectTypeOf<'/invoices/$invoiceId'>(invoiceRoute.id)
  expectTypeOf<'/$invoiceId'>(invoiceRoute.path)
})

test('when creating a layout route', () => {
  expectTypeOf<'/posts'>(postsRoute.fullPath)
  expectTypeOf<'/_postLayout/posts'>(postsRoute.id)
  expectTypeOf<'/posts'>(postsRoute.path)
})

test('when creating a _ suffix route', () => {
  expectTypeOf<'/posts/$postId'>(postRoute.fullPath)
  expectTypeOf<'/$postId_'>(postRoute.path)
  expectTypeOf<'/_postLayout/posts/$postId_'>(postRoute.id)
})

test('when creating a folder group', () => {
  expectTypeOf<'/protected'>(protectedRoute.fullPath)
  expectTypeOf<'(auth)/protected'>(protectedRoute.path)
  expectTypeOf<'/protected'>(protectedRoute.id)
})

test('file route relative Link to child route keeps inherited optional search optional', () => {
  const FileRouterLink = Link<FileRouter, '/optional-search/', './child'>

  ;<FileRouterLink from="/optional-search/" to="./child">
    child
  </FileRouterLink>
  ;<FileRouterLink
    from="/optional-search/"
    to="./child"
    search={{ preload: false }}
  >
    child
  </FileRouterLink>
})

test('file route object lifecycle options compile', () => {
  const objectRoute = createFileRoute('/invoices')({
    context: {
      handler: () => ({ createdAt: new Date() }),
      revalidate: true,
      dehydrate: ({ data }) => ({
        createdAt: data.createdAt.toISOString(),
      }),
      hydrate: ({ data }) => ({
        createdAt: new Date(data.createdAt),
      }),
    },
    beforeLoad: {
      handler: (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{ createdAt: Date }>()
        return { permission: 'view' as const }
      },
      dehydrate: true,
    },
    loader: {
      handler: (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{
          createdAt: Date
          permission: 'view'
        }>()
        return { loadedAt: new Date() }
      },
      dehydrate: ({ data }) => ({
        loadedAt: data.loadedAt.toISOString(),
      }),
      hydrate: ({ data }) => ({
        loadedAt: new Date(data.loadedAt),
      }),
    },
  })

  expectTypeOf(objectRoute.fullPath).toEqualTypeOf<'/invoices'>()
})

test('file route dehydrate fn requires hydrate', () => {
  createFileRoute('/invoices')({
    // @ts-expect-error dehydrate function requires hydrate
    context: {
      handler: () => ({ createdAt: new Date() }),
      dehydrate: ({ data }) => ({
        createdAt: data.createdAt.toISOString(),
      }),
    },
  })
})

test('file route context revalidate function infers prev from handler', () => {
  const revalidateRoute = createFileRoute('/invoices')({
    context: {
      handler: () => ({
        value: 1,
        revalidated: false,
        revalidateRunCount: 0,
      }),
      revalidate: ({ prev, params, deps, matches }) => {
        expectTypeOf(prev).toEqualTypeOf<
          | {
              value: number
              revalidated: boolean
              revalidateRunCount: number
            }
          | undefined
        >()
        expectTypeOf(params).toEqualTypeOf<{}>()
        expectTypeOf(deps).toEqualTypeOf<{}>()
        expectTypeOf(matches).toEqualTypeOf<Array<AnyRouteMatch>>()

        return {
          value: (prev?.value ?? 0) + 1,
          revalidated: true,
          revalidateRunCount: (prev?.revalidateRunCount ?? 0) + 1,
        }
      },
      dehydrate: true,
    },
  })

  expectTypeOf(revalidateRoute.fullPath).toEqualTypeOf<'/invoices'>()
})

test('when file route params.parse returns a discriminated union', () => {
  expectTypeOf(attachmentRoute.types.params).toEqualTypeOf<
    | {
        observationDocId: string
        driveId: string
        type: 'audio'
        variant: 'original'
        name: string
      }
    | {
        observationDocId: string
        driveId: string
        type: 'photo'
        variant: 'original' | 'preview' | 'thumbnail'
        name: string
      }
  >()
})

test('when file route params.parse drops a path param', () => {
  createFileRoute('/invoices/$invoiceId')({
    params: {
      // @ts-expect-error parsed params must keep path param keys
      parse: () => ({}),
    },
  })
})
