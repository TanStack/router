import { lazy } from '@tanstack/react-router';
import { route as parentRoute } from "./__root";
import { Route } from '@tanstack/react-router';
import * as React from 'react';
import { rootRoute } from './__root';
export const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
});
export { route };