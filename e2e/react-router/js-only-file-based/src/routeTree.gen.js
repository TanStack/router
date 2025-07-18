/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { Route as rootRouteImport } from './routes/__root'
import { Route as PathlessLayoutRouteImport } from './routes/_pathlessLayout'
import { Route as PostsRouteRouteImport } from './routes/posts.route'
import { Route as IndexRouteImport } from './routes/index'
import { Route as PostsIndexRouteImport } from './routes/posts.index'
import { Route as PostsPostIdRouteImport } from './routes/posts.$postId'
import { Route as PathlessLayoutNestedLayoutRouteImport } from './routes/_pathlessLayout/_nested-layout'
import { Route as PathlessLayoutNestedLayoutRouteBRouteImport } from './routes/_pathlessLayout/_nested-layout/route-b'
import { Route as PathlessLayoutNestedLayoutRouteARouteImport } from './routes/_pathlessLayout/_nested-layout/route-a'

const PathlessLayoutRoute = PathlessLayoutRouteImport.update({
  id: '/_pathlessLayout',
  getParentRoute: () => rootRouteImport,
})
const PostsRouteRoute = PostsRouteRouteImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRouteImport,
})
const IndexRoute = IndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRouteImport,
})
const PostsIndexRoute = PostsIndexRouteImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => PostsRouteRoute,
})
const PostsPostIdRoute = PostsPostIdRouteImport.update({
  id: '/$postId',
  path: '/$postId',
  getParentRoute: () => PostsRouteRoute,
})
const PathlessLayoutNestedLayoutRoute =
  PathlessLayoutNestedLayoutRouteImport.update({
    id: '/_nested-layout',
    getParentRoute: () => PathlessLayoutRoute,
  })
const PathlessLayoutNestedLayoutRouteBRoute =
  PathlessLayoutNestedLayoutRouteBRouteImport.update({
    id: '/route-b',
    path: '/route-b',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  })
const PathlessLayoutNestedLayoutRouteARoute =
  PathlessLayoutNestedLayoutRouteARouteImport.update({
    id: '/route-a',
    path: '/route-a',
    getParentRoute: () => PathlessLayoutNestedLayoutRoute,
  })

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
export const routeTree = rootRouteImport._addFileChildren(rootRouteChildren)
