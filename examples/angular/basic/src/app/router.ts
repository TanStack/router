import { createRouter } from '@tanstack/angular-router';
import { Route as HomeRoute } from './routes/home.route';
import { Route as AboutRoute } from './routes/about.route';
import { Route as RootRoute } from './routes/root.route';

export const routeTree = RootRoute.addChildren([HomeRoute, AboutRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/angular-router' {
  interface Register {
    router: typeof router;
  }
}
