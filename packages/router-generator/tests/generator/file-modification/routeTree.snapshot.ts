/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { createFileRoute } from '@tanstack/react-router'

// Import Routes

import type { FileRoutesByPath, CreateFileRoute } from '@tanstack/react-router'
import { Route as rootRoute } from './routes/__root'
import { Route as testInitiallyLazyRouteImport } from './routes/(test)/initiallyLazy'
import { Route as testInitiallyEmptyRouteImport } from './routes/(test)/initiallyEmpty'
import { Route as testFooRouteImport } from './routes/(test)/foo'

// Create Virtual Routes

const testBarLazyRouteImport = createFileRoute('/(test)/bar')()

// Create/Update Routes

const testBarLazyRoute = testBarLazyRouteImport
  .update({
    id: '/(test)/bar',
    path: '/bar',
    getParentRoute: () => rootRoute,
  } as any)
  .lazy(() => import('./routes/(test)/bar.lazy').then((d) => d.Route))

const testInitiallyLazyRoute = testInitiallyLazyRouteImport.update({
  id: '/(test)/initiallyLazy',
  path: '/initiallyLazy',
  getParentRoute: () => rootRoute,
} as any)

const testInitiallyEmptyRoute = testInitiallyEmptyRouteImport
  .update({
    id: '/(test)/initiallyEmpty',
    path: '/initiallyEmpty',
    getParentRoute: () => rootRoute,
  } as any)
  .lazy(() =>
    import('./routes/(test)/initiallyEmpty.lazy').then((d) => d.Route),
  )

const testFooRoute = testFooRouteImport.update({
  id: '/(test)/foo',
  path: '/foo',
  getParentRoute: () => rootRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/(test)/foo': {
      id: '/(test)/foo'
      path: '/foo'
      fullPath: '/foo'
      preLoaderRoute: typeof testFooRouteImport
      parentRoute: typeof rootRoute
    }
    '/(test)/initiallyEmpty': {
      id: '/(test)/initiallyEmpty'
      path: '/initiallyEmpty'
      fullPath: '/initiallyEmpty'
      preLoaderRoute: typeof testInitiallyEmptyRouteImport
      parentRoute: typeof rootRoute
    }
    '/(test)/initiallyLazy': {
      id: '/(test)/initiallyLazy'
      path: '/initiallyLazy'
      fullPath: '/initiallyLazy'
      preLoaderRoute: typeof testInitiallyLazyRouteImport
      parentRoute: typeof rootRoute
    }
    '/(test)/bar': {
      id: '/(test)/bar'
      path: '/bar'
      fullPath: '/bar'
      preLoaderRoute: typeof testBarLazyRouteImport
      parentRoute: typeof rootRoute
    }
  }
}

// Add type-safety to the createFileRoute function across the route tree

declare module './routes/(test)/foo' {
  const createFileRoute: CreateFileRoute<
    '/(test)/foo',
    FileRoutesByPath['/(test)/foo']['parentRoute'],
    FileRoutesByPath['/(test)/foo']['id'],
    FileRoutesByPath['/(test)/foo']['path'],
    FileRoutesByPath['/(test)/foo']['fullPath']
  >
}
declare module './routes/(test)/initiallyEmpty' {
  const createFileRoute: CreateFileRoute<
    '/(test)/initiallyEmpty',
    FileRoutesByPath['/(test)/initiallyEmpty']['parentRoute'],
    FileRoutesByPath['/(test)/initiallyEmpty']['id'],
    FileRoutesByPath['/(test)/initiallyEmpty']['path'],
    FileRoutesByPath['/(test)/initiallyEmpty']['fullPath']
  >
}
declare module './routes/(test)/initiallyLazy' {
  const createFileRoute: CreateFileRoute<
    '/(test)/initiallyLazy',
    FileRoutesByPath['/(test)/initiallyLazy']['parentRoute'],
    FileRoutesByPath['/(test)/initiallyLazy']['id'],
    FileRoutesByPath['/(test)/initiallyLazy']['path'],
    FileRoutesByPath['/(test)/initiallyLazy']['fullPath']
  >
}
declare module './routes/(test)/bar.lazy' {
  const createFileRoute: CreateFileRoute<
    '/(test)/bar',
    FileRoutesByPath['/(test)/bar']['parentRoute'],
    FileRoutesByPath['/(test)/bar']['id'],
    FileRoutesByPath['/(test)/bar']['path'],
    FileRoutesByPath['/(test)/bar']['fullPath']
  >
}

// Create and export the route tree

export interface FileRoutesByFullPath {
  '/foo': typeof testFooRoute
  '/initiallyEmpty': typeof testInitiallyEmptyRoute
  '/initiallyLazy': typeof testInitiallyLazyRoute
  '/bar': typeof testBarLazyRoute
}

export interface FileRoutesByTo {
  '/foo': typeof testFooRoute
  '/initiallyEmpty': typeof testInitiallyEmptyRoute
  '/initiallyLazy': typeof testInitiallyLazyRoute
  '/bar': typeof testBarLazyRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/(test)/foo': typeof testFooRoute
  '/(test)/initiallyEmpty': typeof testInitiallyEmptyRoute
  '/(test)/initiallyLazy': typeof testInitiallyLazyRoute
  '/(test)/bar': typeof testBarLazyRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/foo' | '/initiallyEmpty' | '/initiallyLazy' | '/bar'
  fileRoutesByTo: FileRoutesByTo
  to: '/foo' | '/initiallyEmpty' | '/initiallyLazy' | '/bar'
  id:
    | '__root__'
    | '/(test)/foo'
    | '/(test)/initiallyEmpty'
    | '/(test)/initiallyLazy'
    | '/(test)/bar'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  testFooRoute: typeof testFooRoute
  testInitiallyEmptyRoute: typeof testInitiallyEmptyRoute
  testInitiallyLazyRoute: typeof testInitiallyLazyRoute
  testBarLazyRoute: typeof testBarLazyRoute
}

const rootRouteChildren: RootRouteChildren = {
  testFooRoute: testFooRoute,
  testInitiallyEmptyRoute: testInitiallyEmptyRoute,
  testInitiallyLazyRoute: testInitiallyLazyRoute,
  testBarLazyRoute: testBarLazyRoute,
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
        "/(test)/foo",
        "/(test)/initiallyEmpty",
        "/(test)/initiallyLazy",
        "/(test)/bar"
      ]
    },
    "/(test)/foo": {
      "filePath": "(test)/foo.tsx"
    },
    "/(test)/initiallyEmpty": {
      "filePath": "(test)/initiallyEmpty.tsx"
    },
    "/(test)/initiallyLazy": {
      "filePath": "(test)/initiallyLazy.tsx"
    },
    "/(test)/bar": {
      "filePath": "(test)/bar.lazy.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
