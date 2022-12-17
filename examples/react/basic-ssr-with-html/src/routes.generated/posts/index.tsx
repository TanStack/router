import { lazy } from '@tanstack/react-router';
import { routeConfig as parentRouteConfig } from "../posts";
import * as React from 'react';
const routeConfig = parentRouteConfig.createRoute({
  path: "/",
  component: () => <div>Select a post.</div>
});
export { routeConfig };