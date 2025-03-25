/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as PathlessLayoutImport } from './routes/_pathlessLayout'
import { Route as PostsRouteImport } from './routes/posts.route'
import { Route as IndexImport } from './routes/index'
import { Route as PostsIndexImport } from './routes/posts.index'
import { Route as PostsPostIdImport } from './routes/posts.$postId'
import { Route as PathlessLayoutNestedLayoutImport } from './routes/_pathlessLayout/_nested-layout'
import { Route as PathlessLayoutNestedLayoutRouteBImport } from './routes/_pathlessLayout/_nested-layout/route-b'
import { Route as PathlessLayoutNestedLayoutRouteAImport } from './routes/_pathlessLayout/_nested-layout/route-a'

// Create/Update Routes

const PathlessLayoutRoute = PathlessLayoutImport.update({
  id: '/_pathlessLayout',
  getParentRoute: () => rootRoute,
})

const PostsRouteRoute = PostsRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRoute,
})

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
})

const PostsIndexRoute = PostsIndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => PostsRouteRoute,
})

const PostsPostIdRoute = PostsPostIdImport.update({
  id: '/$postId',
  path: '/$postId',
  getParentRoute: () => PostsRouteRoute,
})

const PathlessLayoutNestedLayoutRoute = PathlessLayoutNestedLayoutImport.update(
  {
    id: '/_nested-layout',
    getParentRoute: () => PathlessLayoutRoute,
  },
)

const PathlessLayoutNestedLayoutRouteBRoute =
  PathlessLayoutNestedLayoutRouteBImport.update({
    id: '/route-b',
    path: '/route-b',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  })

const PathlessLayoutNestedLayoutRouteARoute =
  PathlessLayoutNestedLayoutRouteAImport.update({
    id: '/route-a',
    path: '/route-a',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  })

// Create and export the route tree

const PostsRouteRouteChildren = {
  PostsPostIdRoute: PostsPostIdRoute,
  PostsIndexRoute: PostsIndexRoute,
}

const PostsRouteRouteWithChildren = PostsRouteRoute._addFileChildren(
  PostsRouteRouteChildren,
)

const PathlessLayoutNestedLayoutRouteChildren = {
  PathlessLayoutNestedLayoutRouteARoute: PathlessLayoutNestedLayoutRouteARoute,
  PathlessLayoutNestedLayoutRouteBRoute: PathlessLayoutNestedLayoutRouteBRoute,
}

const PathlessLayoutNestedLayoutRouteWithChildren =
  PathlessLayoutNestedLayoutRoute._addFileChildren(
    PathlessLayoutNestedLayoutRouteChildren,
  )

const PathlessLayoutRouteChildren = {
  PathlessLayoutNestedLayoutRoute: PathlessLayoutNestedLayoutRouteWithChildren,
}

const PathlessLayoutRouteWithChildren = PathlessLayoutRoute._addFileChildren(
  PathlessLayoutRouteChildren,
)

const rootRouteChildren = {
  IndexRoute: IndexRoute,
  PostsRouteRoute: PostsRouteRouteWithChildren,
  PathlessLayoutRoute: PathlessLayoutRouteWithChildren,
}

export const routeTree = rootRoute._addFileChildren(rootRouteChildren)

/* ROUTE_MANIFEST_START
{
  "routes": {
    "__root__": {
      "filePath": "__root.jsx",
      "children": [
        "/",
        "/posts",
        "/_pathlessLayout"
      ]
    },
    "/": {
      "filePath": "index.jsx"
    },
    "/posts": {
      "filePath": "posts.route.jsx",
      "children": [
        "/posts/$postId",
        "/posts/"
      ]
    },
    "/_pathlessLayout": {
      "filePath": "_pathlessLayout.jsx",
      "children": [
        "/_pathlessLayout/_nested-layout"
      ]
    },
    "/_pathlessLayout/_nested-layout": {
      "filePath": "_pathlessLayout/_nested-layout.jsx",
      "parent": "/_pathlessLayout",
      "children": [
        "/_pathlessLayout/_nested-layout/route-a",
        "/_pathlessLayout/_nested-layout/route-b"
      ]
    },
    "/posts/$postId": {
      "filePath": "posts.$postId.jsx",
      "parent": "/posts"
    },
    "/posts/": {
      "filePath": "posts.index.jsx",
      "parent": "/posts"
    },
    "/_pathlessLayout/_nested-layout/route-a": {
      "filePath": "_pathlessLayout/_nested-layout/route-a.jsx",
      "parent": "/_pathlessLayout/_nested-layout"
    },
    "/_pathlessLayout/_nested-layout/route-b": {
      "filePath": "_pathlessLayout/_nested-layout/route-b.jsx",
      "parent": "/_pathlessLayout/_nested-layout"
    }
  }
}
ROUTE_MANIFEST_END */
