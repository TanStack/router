import { jsx as _jsx } from 'react/jsx-runtime'
import { createRouter } from '@tanstack/react-router'
// Import the generated route tree
import { routeTree } from './routeTree.gen'
// Set up a Router instance
export const router = createRouter({
  routeTree,
  defaultPendingComponent: () =>
    _jsx('div', { children: 'Loading form global pending component...' }),
})
