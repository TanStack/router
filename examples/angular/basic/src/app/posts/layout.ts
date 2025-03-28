import { createRoute } from '@tanstack/angular-router'

import { rootRoute } from '../root';
import { fetchPosts } from '../posts';

export const postsLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'posts',
  loader: () => fetchPosts(),
}).lazy(() => import('./posts.lazy').then((d) => d.Route))
