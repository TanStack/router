import { rootRoute } from '../root'
import { indexRoute } from '../routes/index'
import { postsRoute } from '../routes/posts'
import { postsIndexRoute } from '../routes/posts/index'
import { postIdRoute } from '../routes/posts/[postId]'
import { ReactRouter } from '@tanstack/react-router'
import { loaderClient } from './loaders'

export const routeTree = rootRoute.addChildren([
  indexRoute,
  postsRoute.addChildren([postsIndexRoute, postIdRoute]),
])

export const router = new ReactRouter({
  routeTree,
  context: {
    loaderClient,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
