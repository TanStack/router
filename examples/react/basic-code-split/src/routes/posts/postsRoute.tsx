import { useLoaderInstance } from '@tanstack/react-loaders'
import { lazyRouteComponent, Route } from '@tanstack/router'
import { rootRoute } from '../root/rootRoute'

export const postsRoute = new Route({
  getParentRoute: () => rootRoute,
  path: 'posts',
  getContext: () => ({
    test: 'true',
  }),
  loader: async ({ context: { loaderClient } }) => {
    await loaderClient.load({ key: 'posts' })
    return () => useLoaderInstance({ key: 'posts' })
  },
}).update({
  component: lazyRouteComponent(() => import('./Posts'), 'Posts'),
})
