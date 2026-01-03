import { createRouter } from '@tanstack/angular-router';
import { Route as HomeRoute } from './routes/home.route';
import { Route as AboutRoute } from './routes/about.route';
import { Route as PostsRoute } from './routes/posts.route';
import { Route as PostDetailRoute } from './routes/posts.$postId.route';
import { Route as RootRoute } from './routes/root.route';

export const routeTree = RootRoute.addChildren([
  HomeRoute,
  AboutRoute,
  PostsRoute.addChildren([PostDetailRoute]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/angular-router' {
  interface Register {
    router: typeof router;
  }
}
