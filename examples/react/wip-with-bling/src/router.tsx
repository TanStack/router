import { createRouter as createReactRouter } from '@tanstack/react-router'

import { rootRoute } from './routes/root'
import { indexRoute } from './routes/index'
import { postsRoute } from './routes/posts'
import { postsIndexRoute } from './routes/posts/index'
import { postIdRoute } from './routes/posts/$postId'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export function createRouter() {
  return createReactRouter({
    routeTree,
    context: {
      head: '',
    },
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
