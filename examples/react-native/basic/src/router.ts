import { createRouter, createNativeHistory } from '@tanstack/react-native-router'
import { routeTree } from './routeTree.gen'

// Create the router with native history
export const router = createRouter({
  routeTree,
  history: createNativeHistory(),
  defaultPreload: 'intent',
})

// Register the router for type safety
declare module '@tanstack/react-native-router' {
  interface Register {
    router: typeof router
  }
}
