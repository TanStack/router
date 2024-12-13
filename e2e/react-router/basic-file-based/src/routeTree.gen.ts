/* eslint-disable */

// @ts-nocheck

// noinspection JSUnusedGlobalSymbols

// This file was automatically generated by TanStack Router.
// You should NOT make any changes in this file as it will be overwritten.
// Additionally, you should also exclude this file from your linter and/or formatter to prevent it from being checked or modified.

import { createFileRoute } from '@tanstack/react-router'

// Import Routes

import { Route as rootRoute } from './routes/__root'
import { Route as PostsImport } from './routes/posts'
import { Route as AnchorImport } from './routes/anchor'
import { Route as LayoutImport } from './routes/_layout'
import { Route as IndexImport } from './routes/index'
import { Route as PostsIndexImport } from './routes/posts.index'
import { Route as StructuralSharingEnabledImport } from './routes/structural-sharing.$enabled'
import { Route as PostsPostIdImport } from './routes/posts.$postId'
import { Route as LayoutLayout2Import } from './routes/_layout/_layout-2'
import { Route as groupLazyinsideImport } from './routes/(group)/lazyinside'
import { Route as groupInsideImport } from './routes/(group)/inside'
import { Route as groupLayoutImport } from './routes/(group)/_layout'
import { Route as anotherGroupOnlyrouteinsideImport } from './routes/(another-group)/onlyrouteinside'
import { Route as PostsPostIdEditImport } from './routes/posts_.$postId.edit'
import { Route as LayoutLayout2LayoutBImport } from './routes/_layout/_layout-2/layout-b'
import { Route as LayoutLayout2LayoutAImport } from './routes/_layout/_layout-2/layout-a'
import { Route as groupSubfolderInsideImport } from './routes/(group)/subfolder/inside'
import { Route as groupLayoutInsidelayoutImport } from './routes/(group)/_layout.insidelayout'

// Create Virtual Routes

const groupImport = createFileRoute('/(group)')()

// Create/Update Routes

const groupRoute = groupImport.update({
  id: '/(group)',
  getParentRoute: () => rootRoute,
} as any)

const PostsRoute = PostsImport.update({
  id: '/posts',
  path: '/posts',
  getParentRoute: () => rootRoute,
} as any)

const AnchorRoute = AnchorImport.update({
  id: '/anchor',
  path: '/anchor',
  getParentRoute: () => rootRoute,
} as any)

const LayoutRoute = LayoutImport.update({
  id: '/_layout',
  getParentRoute: () => rootRoute,
} as any)

const IndexRoute = IndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => rootRoute,
} as any)

const PostsIndexRoute = PostsIndexImport.update({
  id: '/',
  path: '/',
  getParentRoute: () => PostsRoute,
} as any)

const StructuralSharingEnabledRoute = StructuralSharingEnabledImport.update({
  id: '/structural-sharing/$enabled',
  path: '/structural-sharing/$enabled',
  getParentRoute: () => rootRoute,
} as any)

const PostsPostIdRoute = PostsPostIdImport.update({
  id: '/$postId',
  path: '/$postId',
  getParentRoute: () => PostsRoute,
} as any)

const LayoutLayout2Route = LayoutLayout2Import.update({
  id: '/_layout-2',
  getParentRoute: () => LayoutRoute,
} as any)

const groupLazyinsideRoute = groupLazyinsideImport
  .update({
    id: '/lazyinside',
    path: '/lazyinside',
    getParentRoute: () => groupRoute,
  } as any)
  .lazy(() => import('./routes/(group)/lazyinside.lazy').then((d) => d.Route))

const groupInsideRoute = groupInsideImport.update({
  id: '/inside',
  path: '/inside',
  getParentRoute: () => groupRoute,
} as any)

const groupLayoutRoute = groupLayoutImport.update({
  id: '/_layout',
  getParentRoute: () => groupRoute,
} as any)

const anotherGroupOnlyrouteinsideRoute =
  anotherGroupOnlyrouteinsideImport.update({
    id: '/(another-group)/onlyrouteinside',
    path: '/onlyrouteinside',
    getParentRoute: () => rootRoute,
  } as any)

const PostsPostIdEditRoute = PostsPostIdEditImport.update({
  id: '/posts_/$postId/edit',
  path: '/posts/$postId/edit',
  getParentRoute: () => rootRoute,
} as any)

const LayoutLayout2LayoutBRoute = LayoutLayout2LayoutBImport.update({
  id: '/layout-b',
  path: '/layout-b',
  getParentRoute: () => LayoutLayout2Route,
} as any)

const LayoutLayout2LayoutARoute = LayoutLayout2LayoutAImport.update({
  id: '/layout-a',
  path: '/layout-a',
  getParentRoute: () => LayoutLayout2Route,
} as any)

const groupSubfolderInsideRoute = groupSubfolderInsideImport.update({
  id: '/subfolder/inside',
  path: '/subfolder/inside',
  getParentRoute: () => groupRoute,
} as any)

const groupLayoutInsidelayoutRoute = groupLayoutInsidelayoutImport.update({
  id: '/insidelayout',
  path: '/insidelayout',
  getParentRoute: () => groupLayoutRoute,
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
    '/_layout': {
      id: '/_layout'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof LayoutImport
      parentRoute: typeof rootRoute
    }
    '/anchor': {
      id: '/anchor'
      path: '/anchor'
      fullPath: '/anchor'
      preLoaderRoute: typeof AnchorImport
      parentRoute: typeof rootRoute
    }
    '/posts': {
      id: '/posts'
      path: '/posts'
      fullPath: '/posts'
      preLoaderRoute: typeof PostsImport
      parentRoute: typeof rootRoute
    }
    '/(another-group)/onlyrouteinside': {
      id: '/(another-group)/onlyrouteinside'
      path: '/onlyrouteinside'
      fullPath: '/onlyrouteinside'
      preLoaderRoute: typeof anotherGroupOnlyrouteinsideImport
      parentRoute: typeof rootRoute
    }
    '/(group)': {
      id: '/(group)'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof groupImport
      parentRoute: typeof rootRoute
    }
    '/(group)/_layout': {
      id: '/(group)/_layout'
      path: '/'
      fullPath: '/'
      preLoaderRoute: typeof groupLayoutImport
      parentRoute: typeof groupRoute
    }
    '/(group)/inside': {
      id: '/(group)/inside'
      path: '/inside'
      fullPath: '/inside'
      preLoaderRoute: typeof groupInsideImport
      parentRoute: typeof groupImport
    }
    '/(group)/lazyinside': {
      id: '/(group)/lazyinside'
      path: '/lazyinside'
      fullPath: '/lazyinside'
      preLoaderRoute: typeof groupLazyinsideImport
      parentRoute: typeof groupImport
    }
    '/_layout/_layout-2': {
      id: '/_layout/_layout-2'
      path: ''
      fullPath: ''
      preLoaderRoute: typeof LayoutLayout2Import
      parentRoute: typeof LayoutImport
    }
    '/posts/$postId': {
      id: '/posts/$postId'
      path: '/$postId'
      fullPath: '/posts/$postId'
      preLoaderRoute: typeof PostsPostIdImport
      parentRoute: typeof PostsImport
    }
    '/structural-sharing/$enabled': {
      id: '/structural-sharing/$enabled'
      path: '/structural-sharing/$enabled'
      fullPath: '/structural-sharing/$enabled'
      preLoaderRoute: typeof StructuralSharingEnabledImport
      parentRoute: typeof rootRoute
    }
    '/posts/': {
      id: '/posts/'
      path: '/'
      fullPath: '/posts/'
      preLoaderRoute: typeof PostsIndexImport
      parentRoute: typeof PostsImport
    }
    '/(group)/_layout/insidelayout': {
      id: '/(group)/_layout/insidelayout'
      path: '/insidelayout'
      fullPath: '/insidelayout'
      preLoaderRoute: typeof groupLayoutInsidelayoutImport
      parentRoute: typeof groupLayoutImport
    }
    '/(group)/subfolder/inside': {
      id: '/(group)/subfolder/inside'
      path: '/subfolder/inside'
      fullPath: '/subfolder/inside'
      preLoaderRoute: typeof groupSubfolderInsideImport
      parentRoute: typeof groupImport
    }
    '/_layout/_layout-2/layout-a': {
      id: '/_layout/_layout-2/layout-a'
      path: '/layout-a'
      fullPath: '/layout-a'
      preLoaderRoute: typeof LayoutLayout2LayoutAImport
      parentRoute: typeof LayoutLayout2Import
    }
    '/_layout/_layout-2/layout-b': {
      id: '/_layout/_layout-2/layout-b'
      path: '/layout-b'
      fullPath: '/layout-b'
      preLoaderRoute: typeof LayoutLayout2LayoutBImport
      parentRoute: typeof LayoutLayout2Import
    }
    '/posts_/$postId/edit': {
      id: '/posts_/$postId/edit'
      path: '/posts/$postId/edit'
      fullPath: '/posts/$postId/edit'
      preLoaderRoute: typeof PostsPostIdEditImport
      parentRoute: typeof rootRoute
    }
  }
}

// Create and export the route tree

interface LayoutLayout2RouteChildren {
  LayoutLayout2LayoutARoute: typeof LayoutLayout2LayoutARoute
  LayoutLayout2LayoutBRoute: typeof LayoutLayout2LayoutBRoute
}

const LayoutLayout2RouteChildren: LayoutLayout2RouteChildren = {
  LayoutLayout2LayoutARoute: LayoutLayout2LayoutARoute,
  LayoutLayout2LayoutBRoute: LayoutLayout2LayoutBRoute,
}

const LayoutLayout2RouteWithChildren = LayoutLayout2Route._addFileChildren(
  LayoutLayout2RouteChildren,
)

interface LayoutRouteChildren {
  LayoutLayout2Route: typeof LayoutLayout2RouteWithChildren
}

const LayoutRouteChildren: LayoutRouteChildren = {
  LayoutLayout2Route: LayoutLayout2RouteWithChildren,
}

const LayoutRouteWithChildren =
  LayoutRoute._addFileChildren(LayoutRouteChildren)

interface PostsRouteChildren {
  PostsPostIdRoute: typeof PostsPostIdRoute
  PostsIndexRoute: typeof PostsIndexRoute
}

const PostsRouteChildren: PostsRouteChildren = {
  PostsPostIdRoute: PostsPostIdRoute,
  PostsIndexRoute: PostsIndexRoute,
}

const PostsRouteWithChildren = PostsRoute._addFileChildren(PostsRouteChildren)

interface groupLayoutRouteChildren {
  groupLayoutInsidelayoutRoute: typeof groupLayoutInsidelayoutRoute
}

const groupLayoutRouteChildren: groupLayoutRouteChildren = {
  groupLayoutInsidelayoutRoute: groupLayoutInsidelayoutRoute,
}

const groupLayoutRouteWithChildren = groupLayoutRoute._addFileChildren(
  groupLayoutRouteChildren,
)

interface groupRouteChildren {
  groupLayoutRoute: typeof groupLayoutRouteWithChildren
  groupInsideRoute: typeof groupInsideRoute
  groupLazyinsideRoute: typeof groupLazyinsideRoute
  groupSubfolderInsideRoute: typeof groupSubfolderInsideRoute
}

const groupRouteChildren: groupRouteChildren = {
  groupLayoutRoute: groupLayoutRouteWithChildren,
  groupInsideRoute: groupInsideRoute,
  groupLazyinsideRoute: groupLazyinsideRoute,
  groupSubfolderInsideRoute: groupSubfolderInsideRoute,
}

const groupRouteWithChildren = groupRoute._addFileChildren(groupRouteChildren)

export interface FileRoutesByFullPath {
  '/': typeof groupLayoutRouteWithChildren
  '': typeof LayoutLayout2RouteWithChildren
  '/anchor': typeof AnchorRoute
  '/posts': typeof PostsRouteWithChildren
  '/onlyrouteinside': typeof anotherGroupOnlyrouteinsideRoute
  '/inside': typeof groupInsideRoute
  '/lazyinside': typeof groupLazyinsideRoute
  '/posts/$postId': typeof PostsPostIdRoute
  '/structural-sharing/$enabled': typeof StructuralSharingEnabledRoute
  '/posts/': typeof PostsIndexRoute
  '/insidelayout': typeof groupLayoutInsidelayoutRoute
  '/subfolder/inside': typeof groupSubfolderInsideRoute
  '/layout-a': typeof LayoutLayout2LayoutARoute
  '/layout-b': typeof LayoutLayout2LayoutBRoute
  '/posts/$postId/edit': typeof PostsPostIdEditRoute
}

export interface FileRoutesByTo {
  '/': typeof groupLayoutRouteWithChildren
  '': typeof LayoutLayout2RouteWithChildren
  '/anchor': typeof AnchorRoute
  '/onlyrouteinside': typeof anotherGroupOnlyrouteinsideRoute
  '/inside': typeof groupInsideRoute
  '/lazyinside': typeof groupLazyinsideRoute
  '/posts/$postId': typeof PostsPostIdRoute
  '/structural-sharing/$enabled': typeof StructuralSharingEnabledRoute
  '/posts': typeof PostsIndexRoute
  '/insidelayout': typeof groupLayoutInsidelayoutRoute
  '/subfolder/inside': typeof groupSubfolderInsideRoute
  '/layout-a': typeof LayoutLayout2LayoutARoute
  '/layout-b': typeof LayoutLayout2LayoutBRoute
  '/posts/$postId/edit': typeof PostsPostIdEditRoute
}

export interface FileRoutesById {
  __root__: typeof rootRoute
  '/': typeof IndexRoute
  '/_layout': typeof LayoutRouteWithChildren
  '/anchor': typeof AnchorRoute
  '/posts': typeof PostsRouteWithChildren
  '/(another-group)/onlyrouteinside': typeof anotherGroupOnlyrouteinsideRoute
  '/(group)': typeof groupRouteWithChildren
  '/(group)/_layout': typeof groupLayoutRouteWithChildren
  '/(group)/inside': typeof groupInsideRoute
  '/(group)/lazyinside': typeof groupLazyinsideRoute
  '/_layout/_layout-2': typeof LayoutLayout2RouteWithChildren
  '/posts/$postId': typeof PostsPostIdRoute
  '/structural-sharing/$enabled': typeof StructuralSharingEnabledRoute
  '/posts/': typeof PostsIndexRoute
  '/(group)/_layout/insidelayout': typeof groupLayoutInsidelayoutRoute
  '/(group)/subfolder/inside': typeof groupSubfolderInsideRoute
  '/_layout/_layout-2/layout-a': typeof LayoutLayout2LayoutARoute
  '/_layout/_layout-2/layout-b': typeof LayoutLayout2LayoutBRoute
  '/posts_/$postId/edit': typeof PostsPostIdEditRoute
}

export interface FileRouteTypes {
  fileRoutesByFullPath: FileRoutesByFullPath
  fullPaths:
    | '/'
    | ''
    | '/anchor'
    | '/posts'
    | '/onlyrouteinside'
    | '/inside'
    | '/lazyinside'
    | '/posts/$postId'
    | '/structural-sharing/$enabled'
    | '/posts/'
    | '/insidelayout'
    | '/subfolder/inside'
    | '/layout-a'
    | '/layout-b'
    | '/posts/$postId/edit'
  fileRoutesByTo: FileRoutesByTo
  to:
    | '/'
    | ''
    | '/anchor'
    | '/onlyrouteinside'
    | '/inside'
    | '/lazyinside'
    | '/posts/$postId'
    | '/structural-sharing/$enabled'
    | '/posts'
    | '/insidelayout'
    | '/subfolder/inside'
    | '/layout-a'
    | '/layout-b'
    | '/posts/$postId/edit'
  id:
    | '__root__'
    | '/'
    | '/_layout'
    | '/anchor'
    | '/posts'
    | '/(another-group)/onlyrouteinside'
    | '/(group)'
    | '/(group)/_layout'
    | '/(group)/inside'
    | '/(group)/lazyinside'
    | '/_layout/_layout-2'
    | '/posts/$postId'
    | '/structural-sharing/$enabled'
    | '/posts/'
    | '/(group)/_layout/insidelayout'
    | '/(group)/subfolder/inside'
    | '/_layout/_layout-2/layout-a'
    | '/_layout/_layout-2/layout-b'
    | '/posts_/$postId/edit'
  fileRoutesById: FileRoutesById
}

export interface RootRouteChildren {
  IndexRoute: typeof IndexRoute
  LayoutRoute: typeof LayoutRouteWithChildren
  AnchorRoute: typeof AnchorRoute
  PostsRoute: typeof PostsRouteWithChildren
  anotherGroupOnlyrouteinsideRoute: typeof anotherGroupOnlyrouteinsideRoute
  groupRoute: typeof groupRouteWithChildren
  StructuralSharingEnabledRoute: typeof StructuralSharingEnabledRoute
  PostsPostIdEditRoute: typeof PostsPostIdEditRoute
}

const rootRouteChildren: RootRouteChildren = {
  IndexRoute: IndexRoute,
  LayoutRoute: LayoutRouteWithChildren,
  AnchorRoute: AnchorRoute,
  PostsRoute: PostsRouteWithChildren,
  anotherGroupOnlyrouteinsideRoute: anotherGroupOnlyrouteinsideRoute,
  groupRoute: groupRouteWithChildren,
  StructuralSharingEnabledRoute: StructuralSharingEnabledRoute,
  PostsPostIdEditRoute: PostsPostIdEditRoute,
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
        "/_layout",
        "/anchor",
        "/posts",
        "/(another-group)/onlyrouteinside",
        "/(group)",
        "/structural-sharing/$enabled",
        "/posts_/$postId/edit"
      ]
    },
    "/": {
      "filePath": "index.tsx"
    },
    "/_layout": {
      "filePath": "_layout.tsx",
      "children": [
        "/_layout/_layout-2"
      ]
    },
    "/anchor": {
      "filePath": "anchor.tsx"
    },
    "/posts": {
      "filePath": "posts.tsx",
      "children": [
        "/posts/$postId",
        "/posts/"
      ]
    },
    "/(another-group)/onlyrouteinside": {
      "filePath": "(another-group)/onlyrouteinside.tsx"
    },
    "/(group)": {
      "filePath": "(group)",
      "children": [
        "/(group)/_layout",
        "/(group)/inside",
        "/(group)/lazyinside",
        "/(group)/subfolder/inside"
      ]
    },
    "/(group)/_layout": {
      "filePath": "(group)/_layout.tsx",
      "parent": "/(group)",
      "children": [
        "/(group)/_layout/insidelayout"
      ]
    },
    "/(group)/inside": {
      "filePath": "(group)/inside.tsx",
      "parent": "/(group)"
    },
    "/(group)/lazyinside": {
      "filePath": "(group)/lazyinside.tsx",
      "parent": "/(group)"
    },
    "/_layout/_layout-2": {
      "filePath": "_layout/_layout-2.tsx",
      "parent": "/_layout",
      "children": [
        "/_layout/_layout-2/layout-a",
        "/_layout/_layout-2/layout-b"
      ]
    },
    "/posts/$postId": {
      "filePath": "posts.$postId.tsx",
      "parent": "/posts"
    },
    "/structural-sharing/$enabled": {
      "filePath": "structural-sharing.$enabled.tsx"
    },
    "/posts/": {
      "filePath": "posts.index.tsx",
      "parent": "/posts"
    },
    "/(group)/_layout/insidelayout": {
      "filePath": "(group)/_layout.insidelayout.tsx",
      "parent": "/(group)/_layout"
    },
    "/(group)/subfolder/inside": {
      "filePath": "(group)/subfolder/inside.tsx",
      "parent": "/(group)"
    },
    "/_layout/_layout-2/layout-a": {
      "filePath": "_layout/_layout-2/layout-a.tsx",
      "parent": "/_layout/_layout-2"
    },
    "/_layout/_layout-2/layout-b": {
      "filePath": "_layout/_layout-2/layout-b.tsx",
      "parent": "/_layout/_layout-2"
    },
    "/posts_/$postId/edit": {
      "filePath": "posts_.$postId.edit.tsx"
    }
  }
}
ROUTE_MANIFEST_END */
