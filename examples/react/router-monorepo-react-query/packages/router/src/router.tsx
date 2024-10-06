import React from 'react';
import { createRouter, RouteIds } from '@tanstack/react-router';

// Import the generated route tree
import { routeTree } from './routeTree.gen';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();

// Set up a Router instance
export const router = createRouter({
  routeTree,
  context: {
    queryClient,
  },
  defaultPendingComponent: () => (
    <div>Loading form global pending component...</div>
  ),
  // This make the loader only wait 200ms before shoing the pending component, instead of the default 1000ms
  defaultPendingMs: 200,
  defaultPreload: 'intent',
  // Since we're using React Query, we don't want loader calls to ever be stale
  // This will ensure that the loader is always called when the route is preloaded or visited
  defaultPreloadStaleTime: 0,
});

export type RouterType = typeof router;
export type RouterIds = RouteIds<RouterType['routeTree']>;
