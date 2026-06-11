import { createRoute } from '@tanstack/react-router';

import { Route as rootRoute } from './routes/__root';

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
}).lazy(() => import('./routes/index').then((d) => d.Route));

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
}).lazy(() => import('./routes/about').then((d) => d.Route));


export const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
]);
