/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { createFileRoute } from '@tanstack/react-router'

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as FooLayoutRouteImport } from './routes/foo/_layout/route'
import { Route as FooLayoutIndexImport } from './routes/foo/_layout/index'

// Create Virtual Routes

const FooImport = createFileRoute('/foo')()

// Create/Update Routes

const FooRoute = FooImport.update({
  id: '/foo',
  path: '/foo',
  getParentRoute: () => rootRoute,
} as any)

const FooLayoutRouteRoute = FooLayoutRouteImport.update({
  id: '/_layout',
  getParentRoute: () => FooRoute,
} as any)

const FooLayoutIndexRoute = FooLayoutIndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => FooLayoutRouteRoute,
} as any)

// Populate the FileRoutesByPath interface

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/foo': {
      id: '/foo'
      path: '/foo'
      fullPath: '/foo'
      preLoaderRoute: typeof FooImport
      parentRoute: typeof rootRoute
    }
    '/foo/_layout': {
      id: '/foo/_layout'
      path: '/foo'
      fullPath: '/foo'
      preLoaderRoute: typeof FooLayoutRouteImport
      parentRoute: typeof FooRoute
    }
    '/foo/_layout/': {
      id: '/foo/_layout/'
      path: '/'
      fullPath: '/foo/'
      preLoaderRoute: typeof FooLayoutIndexImport
      parentRoute: typeof FooLayoutRouteImport
    }
  }
}

// Create and export the route tree

interface FooLayoutRouteRouteChildren {
  FooLayoutIndexRoute: typeof FooLayoutIndexRoute
}

const FooLayoutRouteRouteChildren: FooLayoutRouteRouteChildren = {
  FooLayoutIndexRoute: FooLayoutIndexRoute,
}

const FooLayoutRouteRouteWithChildren = FooLayoutRouteRoute._addFileChildren(
  FooLayoutRouteRouteChildren,
)

interface FooRouteChildren {
  FooLayoutRouteRoute: typeof FooLayoutRouteRouteWithChildren
}

const FooRouteChildren: FooRouteChildren = {
  FooLayoutRouteRoute: FooLayoutRouteRouteWithChildren,
}

const FooRouteWithChildren = FooRoute._addFileChildren(FooRouteChildren)

export interface FileRoutesByFullPath {
  '/foo': typeof FooLayoutRouteRouteWithChildren
  '/foo/': typeof FooLayoutIndexRoute
}

export interface FileRoutesByTo {
  '/foo': typeof FooLayoutIndexRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/foo': typeof FooRouteWithChildren
  '/foo/_layout': typeof FooLayoutRouteRouteWithChildren
  '/foo/_layout/': typeof FooLayoutIndexRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths: '/foo' | '/foo/'
  fileRoutesByTo: FileRoutesByTo
  to: '/foo'
  id: '__root__' | '/foo' | '/foo/_layout' | '/foo/_layout/'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  FooRoute: typeof FooRouteWithChildren
}

const rootRouteChildren: RootRouteChildren = {
  FooRoute: FooRouteWithChildren,
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
        "/foo"
      ]
    },
    "/foo": {
      "filePath": "foo/_layout",
      "children": [
        "/foo/_layout"
      ]
    },
    "/foo/_layout": {
      "filePath": "foo/_layout/route.tsx",
      "parent": "/foo",
      "children": [
        "/foo/_layout/"
      ]
    },
    "/foo/_layout/": {
      "filePath": "foo/_layout/index.tsx",
      "parent": "/foo/_layout"
    }
  }
}
ROUTE_MANIFEST_END */
