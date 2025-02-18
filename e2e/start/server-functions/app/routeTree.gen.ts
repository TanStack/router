/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as SubmitPostFormdataImport } from './routes/submit-post-formdata'
import { Route as StatusImport } from './routes/status'
import { Route as SerializeFormDataImport } from './routes/serialize-form-data'
import { Route as ReturnNullImport } from './routes/return-null'
import { Route as MultipartImport } from './routes/multipart'
import { Route as IsomorphicFnsImport } from './routes/isomorphic-fns'
import { Route as HeadersImport } from './routes/headers'
import { Route as EnvOnlyImport } from './routes/env-only'
import { Route as ConsistentImport } from './routes/consistent'
import { Route as IndexImport } from './routes/index'
import { Route as CookiesIndexImport } from './routes/cookies/index'
import { Route as CookiesSetImport } from './routes/cookies/set'

// Create/Update Routes

const SubmitPostFormdataRoute = SubmitPostFormdataImport.update({
  id: '/submit-post-formdata',
  path: '/submit-post-formdata',
  getParentRoute: () => rootRoute,
} as any)

const StatusRoute = StatusImport.update({
  id: '/status',
  path: '/status',
  getParentRoute: () => rootRoute,
} as any)

const SerializeFormDataRoute = SerializeFormDataImport.update({
  id: '/serialize-form-data',
  path: '/serialize-form-data',
  getParentRoute: () => rootRoute,
} as any)

const ReturnNullRoute = ReturnNullImport.update({
  id: '/return-null',
  path: '/return-null',
  getParentRoute: () => rootRoute,
} as any)

const MultipartRoute = MultipartImport.update({
  id: '/multipart',
  path: '/multipart',
  getParentRoute: () => rootRoute,
} as any)

const IsomorphicFnsRoute = IsomorphicFnsImport.update({
  id: '/isomorphic-fns',
  path: '/isomorphic-fns',
  getParentRoute: () => rootRoute,
} as any)

const HeadersRoute = HeadersImport.update({
  id: '/headers',
  path: '/headers',
  getParentRoute: () => rootRoute,
} as any)

const EnvOnlyRoute = EnvOnlyImport.update({
  id: '/env-only',
  path: '/env-only',
  getParentRoute: () => rootRoute,
} as any)

const ConsistentRoute = ConsistentImport.update({
  id: '/consistent',
  path: '/consistent',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const CookiesIndexRoute = CookiesIndexImport.update({
  id: '/cookies/',
  path: '/cookies/',
  getParentRoute: () => rootRoute,
} as any)

const CookiesSetRoute = CookiesSetImport.update({
  id: '/cookies/set',
  path: '/cookies/set',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      id: '/'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof IndexImport
      parentRoute: typeof rootRoute
    }
    '/consistent': {
      id: '/consistent'
      path: '/consistent'
      fullPath: '/consistent'
      preLoaderRoute: typeof ConsistentImport
      parentRoute: typeof rootRoute
    }
    '/env-only': {
      id: '/env-only'
      path: '/env-only'
      fullPath: '/env-only'
      preLoaderRoute: typeof EnvOnlyImport
      parentRoute: typeof rootRoute
    }
    '/headers': {
      id: '/headers'
      path: '/headers'
      fullPath: '/headers'
      preLoaderRoute: typeof HeadersImport
      parentRoute: typeof rootRoute
    }
    '/isomorphic-fns': {
      id: '/isomorphic-fns'
      path: '/isomorphic-fns'
      fullPath: '/isomorphic-fns'
      preLoaderRoute: typeof IsomorphicFnsImport
      parentRoute: typeof rootRoute
    }
    '/multipart': {
      id: '/multipart'
      path: '/multipart'
      fullPath: '/multipart'
      preLoaderRoute: typeof MultipartImport
      parentRoute: typeof rootRoute
    }
    '/return-null': {
      id: '/return-null'
      path: '/return-null'
      fullPath: '/return-null'
      preLoaderRoute: typeof ReturnNullImport
      parentRoute: typeof rootRoute
    }
    '/serialize-form-data': {
      id: '/serialize-form-data'
      path: '/serialize-form-data'
      fullPath: '/serialize-form-data'
      preLoaderRoute: typeof SerializeFormDataImport
      parentRoute: typeof rootRoute
    }
    '/status': {
      id: '/status'
      path: '/status'
      fullPath: '/status'
      preLoaderRoute: typeof StatusImport
      parentRoute: typeof rootRoute
    }
    '/submit-post-formdata': {
      id: '/submit-post-formdata'
      path: '/submit-post-formdata'
      fullPath: '/submit-post-formdata'
      preLoaderRoute: typeof SubmitPostFormdataImport
      parentRoute: typeof rootRoute
    }
    '/cookies/set': {
      id: '/cookies/set'
      path: '/cookies/set'
      fullPath: '/cookies/set'
      preLoaderRoute: typeof CookiesSetImport
      parentRoute: typeof rootRoute
    }
    '/cookies/': {
      id: '/cookies/'
      path: '/cookies'
      fullPath: '/cookies'
      preLoaderRoute: typeof CookiesIndexImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/': typeof IndexRoute
  '/consistent': typeof ConsistentRoute
  '/env-only': typeof EnvOnlyRoute
  '/headers': typeof HeadersRoute
  '/isomorphic-fns': typeof IsomorphicFnsRoute
  '/multipart': typeof MultipartRoute
  '/return-null': typeof ReturnNullRoute
  '/serialize-form-data': typeof SerializeFormDataRoute
  '/status': typeof StatusRoute
  '/submit-post-formdata': typeof SubmitPostFormdataRoute
  '/cookies/set': typeof CookiesSetRoute
  '/cookies': typeof CookiesIndexRoute
}

export interface FileRoutesByTo {
  '/': typeof IndexRoute
  '/consistent': typeof ConsistentRoute
  '/env-only': typeof EnvOnlyRoute
  '/headers': typeof HeadersRoute
  '/isomorphic-fns': typeof IsomorphicFnsRoute
  '/multipart': typeof MultipartRoute
  '/return-null': typeof ReturnNullRoute
  '/serialize-form-data': typeof SerializeFormDataRoute
  '/status': typeof StatusRoute
  '/submit-post-formdata': typeof SubmitPostFormdataRoute
  '/cookies/set': typeof CookiesSetRoute
  '/cookies': typeof CookiesIndexRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/consistent': typeof ConsistentRoute
  '/env-only': typeof EnvOnlyRoute
  '/headers': typeof HeadersRoute
  '/isomorphic-fns': typeof IsomorphicFnsRoute
  '/multipart': typeof MultipartRoute
  '/return-null': typeof ReturnNullRoute
  '/serialize-form-data': typeof SerializeFormDataRoute
  '/status': typeof StatusRoute
  '/submit-post-formdata': typeof SubmitPostFormdataRoute
  '/cookies/set': typeof CookiesSetRoute
  '/cookies/': typeof CookiesIndexRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | '/consistent'
    | '/env-only'
    | '/headers'
    | '/isomorphic-fns'
    | '/multipart'
    | '/return-null'
    | '/serialize-form-data'
    | '/status'
    | '/submit-post-formdata'
    | '/cookies/set'
    | '/cookies'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | '/consistent'
    | '/env-only'
    | '/headers'
    | '/isomorphic-fns'
    | '/multipart'
    | '/return-null'
    | '/serialize-form-data'
    | '/status'
    | '/submit-post-formdata'
    | '/cookies/set'
    | '/cookies'
  id:
    | '__root__'
    | '/'
    | '/consistent'
    | '/env-only'
    | '/headers'
    | '/isomorphic-fns'
    | '/multipart'
    | '/return-null'
    | '/serialize-form-data'
    | '/status'
    | '/submit-post-formdata'
    | '/cookies/set'
    | '/cookies/'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  ConsistentRoute: typeof ConsistentRoute
  EnvOnlyRoute: typeof EnvOnlyRoute
  HeadersRoute: typeof HeadersRoute
  IsomorphicFnsRoute: typeof IsomorphicFnsRoute
  MultipartRoute: typeof MultipartRoute
  ReturnNullRoute: typeof ReturnNullRoute
  SerializeFormDataRoute: typeof SerializeFormDataRoute
  StatusRoute: typeof StatusRoute
  SubmitPostFormdataRoute: typeof SubmitPostFormdataRoute
  CookiesSetRoute: typeof CookiesSetRoute
  CookiesIndexRoute: typeof CookiesIndexRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  ConsistentRoute: ConsistentRoute,
  EnvOnlyRoute: EnvOnlyRoute,
  HeadersRoute: HeadersRoute,
  IsomorphicFnsRoute: IsomorphicFnsRoute,
  MultipartRoute: MultipartRoute,
  ReturnNullRoute: ReturnNullRoute,
  SerializeFormDataRoute: SerializeFormDataRoute,
  StatusRoute: StatusRoute,
  SubmitPostFormdataRoute: SubmitPostFormdataRoute,
  CookiesSetRoute: CookiesSetRoute,
  CookiesIndexRoute: CookiesIndexRoute,
}

export const routeTree = rootRoute
  ._addFileChildren(rootRouteChildren)
  ._addFileTypes<FileRouteTypes>()

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.tsx",
      "children": [
        "/",
        "/consistent",
        "/env-only",
        "/headers",
        "/isomorphic-fns",
        "/multipart",
        "/return-null",
        "/serialize-form-data",
        "/status",
        "/submit-post-formdata",
        "/cookies/set",
        "/cookies/"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/consistent": {
      "filePath": "consistent.tsx"
    },
    "/env-only": {
      "filePath": "env-only.tsx"
    },
    "/headers": {
      "filePath": "headers.tsx"
    },
    "/isomorphic-fns": {
      "filePath": "isomorphic-fns.tsx"
    },
    "/multipart": {
      "filePath": "multipart.tsx"
    },
    "/return-null": {
      "filePath": "return-null.tsx"
    },
    "/serialize-form-data": {
      "filePath": "serialize-form-data.tsx"
    },
    "/status": {
      "filePath": "status.tsx"
    },
    "/submit-post-formdata": {
      "filePath": "submit-post-formdata.tsx"
    },
    "/cookies/set": {
      "filePath": "cookies/set.tsx"
    },
    "/cookies/": {
      "filePath": "cookies/index.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
