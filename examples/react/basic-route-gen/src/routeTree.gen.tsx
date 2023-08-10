import { route as rootRoute } from './routes/root'
import { route as indexRoute } from './routes/index'
import { route as postsRoute } from './routes/posts'
import { route as postsIndexRoute } from './routes/posts.index'
import { route as postsPostRoute } from './routes/posts.posts'

declare module '@tanstack/react-router' {
  interface FileRoutesByPath {
    '/': {
      parentRoute: typeof rootRoute
    }
    '/posts': {
      parentRoute: typeof rootRoute
    }
    '/posts/': {
      parentRoute: typeof postsRoute
    }
    '/posts/$postId': {
      parentRoute: typeof postsRoute
    }
  }
}

export const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postsPostRoute, postsIndexRoute]),
  indexRoute,
])
