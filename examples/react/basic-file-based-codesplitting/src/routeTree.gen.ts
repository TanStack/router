import { FileRoute, lazyFn, lazyRouteComponent } from '@tanstack/react-router'

import { Route as rootRoute } from './routes/__root'
import { Route as PostsIndexImport } from './routes/posts.index'
import { Route as LayoutTestLayoutBImport } from './routes/_layout-test/layout-b'
import { Route as LayoutTestLayoutAImport } from './routes/_layout-test/layout-a'
import { Route as PostsPostIdRouteImport } from './routes/posts.$postId/route'

const PostsComponentImport = new FileRoute('/posts').createRoute()
const LayoutTestComponentImport = new FileRoute('/_layout-test').createRoute()
const IndexComponentImport = new FileRoute('/').createRoute()
const PostsPostIdDeepComponentImport = new FileRoute(
  '/posts/$postId/deep',
).createRoute()
const LayoutTestLayoutBTestComponentImport = new FileRoute(
  '/_layout-test/layout-b/test',
).createRoute()

const PostsComponentRoute = PostsComponentImport.update({
  path: '/posts',
  getParentRoute: () => rootRoute,
} as any)
  .updateLoader({
    loader: lazyFn(() => import('./routes/posts.loader'), 'loader'),
  })
  .update({
    component: lazyRouteComponent(
      () => import('./routes/posts.component'),
      'component',
    ),
  })

const LayoutTestComponentRoute = LayoutTestComponentImport.update({
  id: '/_layout-test',
  getParentRoute: () => rootRoute,
} as any).update({
  component: lazyRouteComponent(
    () => import('./routes/_layout-test.component'),
    'component',
  ),
})

const IndexComponentRoute = IndexComponentImport.update({
  path: '/',
  getParentRoute: () => rootRoute,
} as any).update({
  component: lazyRouteComponent(
    () => import('./routes/index.component'),
    'component',
  ),
})

const PostsIndexRoute = PostsIndexImport.update({
  path: '/',
  getParentRoute: () => PostsComponentRoute,
} as any)

const LayoutTestLayoutBRoute = LayoutTestLayoutBImport.update({
  path: '/layout-b',
  getParentRoute: () => LayoutTestComponentRoute,
} as any)

const LayoutTestLayoutARoute = LayoutTestLayoutAImport.update({
  path: '/layout-a',
  getParentRoute: () => LayoutTestComponentRoute,
} as any)

const PostsPostIdRouteRoute = PostsPostIdRouteImport.update({
  path: '/$postId',
  getParentRoute: () => PostsComponentRoute,
} as any)
  .updateLoader({
    loader: lazyFn(() => import('./routes/posts.$postId/loader'), 'loader'),
  })
  .update({
    component: lazyRouteComponent(
      () => import('./routes/posts.$postId/component'),
      'component',
    ),
    errorComponent: lazyRouteComponent(
      () => import('./routes/posts.$postId/errorComponent'),
      'errorComponent',
    ),
  })

const PostsPostIdDeepComponentRoute = PostsPostIdDeepComponentImport.update({
  path: '/posts/$postId/deep',
  getParentRoute: () => rootRoute,
} as any)
  .updateLoader({
    loader: lazyFn(
      () => import('./routes/posts_.$postId.deep.loader'),
      'loader',
    ),
  })
  .update({
    component: lazyRouteComponent(
      () => import('./routes/posts_.$postId.deep.component'),
      'component',
    ),
    errorComponent: lazyRouteComponent(
      () => import('./routes/posts_.$postId.deep.errorComponent'),
      'errorComponent',
    ),
  })

const LayoutTestLayoutBTestComponentRoute =
  LayoutTestLayoutBTestComponentImport.update({
    path: '/test',
    getParentRoute: () => LayoutTestLayoutBRoute,
  } as any).update({
    component: lazyRouteComponent(
      () => import('./routes/_layout-test/layout-b.test.component'),
      'component',
    ),
  })
declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      preLoaderRoute: typeof IndexComponentImport
      parentRoute: typeof rootRoute
    }
    '/_layout-test': {
      preLoaderRoute: typeof LayoutTestComponentImport
      parentRoute: typeof rootRoute
    }
    '/posts': {
      preLoaderRoute: typeof PostsComponentImport
      parentRoute: typeof rootRoute
    }
    '/posts/$postId': {
      preLoaderRoute: typeof PostsPostIdRouteImport
      parentRoute: typeof PostsComponentImport
    }
    '/_layout-test/layout-a': {
      preLoaderRoute: typeof LayoutTestLayoutAImport
      parentRoute: typeof LayoutTestComponentImport
    }
    '/_layout-test/layout-b': {
      preLoaderRoute: typeof LayoutTestLayoutBImport
      parentRoute: typeof LayoutTestComponentImport
    }
    '/posts/': {
      preLoaderRoute: typeof PostsIndexImport
      parentRoute: typeof PostsComponentImport
    }
    '/_layout-test/layout-b/test': {
      preLoaderRoute: typeof LayoutTestLayoutBTestComponentImport
      parentRoute: typeof LayoutTestLayoutBImport
    }
    '/posts/$postId/deep': {
      preLoaderRoute: typeof PostsPostIdDeepComponentImport
      parentRoute: typeof rootRoute
    }
  }
}
export const routeTree = rootRoute.addChildren([
  IndexComponentRoute,
  LayoutTestComponentRoute.addChildren([
    LayoutTestLayoutARoute,
    LayoutTestLayoutBRoute.addChildren([LayoutTestLayoutBTestComponentRoute]),
  ]),
  PostsComponentRoute.addChildren([PostsPostIdRouteRoute, PostsIndexRoute]),
  PostsPostIdDeepComponentRoute,
])
