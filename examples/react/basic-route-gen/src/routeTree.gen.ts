import { route as rootRoute } from './routes/_root'

import { route as indexRoute } from './routes/index'
import { route as postsindexRoute } from './routes/posts.index'
import { route as postsRoute } from './routes/posts'
import { route as postspostIdRoute } from './routes/posts.$postId'

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      parentRoute: typeof rootRoute
    }
    'posts': {
      parentRoute: typeof rootRoute
    }
    'posts/': {
      parentRoute: typeof postsRoute
    }
    'posts/$postId': {
      parentRoute: typeof postsRoute
    }  
  }
}

Object.assign(indexRoute.options, {
  path: '/',
  getParentRoute: () => rootRoute,
})
Object.assign(postsRoute.options, {
  path: 'posts',
  getParentRoute: () => rootRoute,
})
Object.assign(postsindexRoute.options, {
  path: '/',
  getParentRoute: () => postsRoute,
})
Object.assign(postspostIdRoute.options, {
  path: '/$postId',
  getParentRoute: () => postsRoute,
})

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([
    postsindexRoute,
    postspostIdRoute
  ])
])