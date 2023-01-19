import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "./__root";
import * as React from 'react';
const routeConfig = parentRouteConfig.createRoute({
  path: "/",
  component: () => <div>
      <h3>Welcome Home!</h3>
    </div>
});
export { routeConfig };