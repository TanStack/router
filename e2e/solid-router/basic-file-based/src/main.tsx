import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { render } from 'solid-js/web'
import { routeTree } from './routeTree.gen'
import './styles.css'

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
  scrollRestoration: true,
  routeMasks: [
    {
      routeTree: null as any,
      from: '/masks/admin/$userId',
      to: '/masks/public/$username',
      params: (prev: any) => ({
        username: `user-${prev.userId}`,
      }),
    },
  ],
})

// Register things for typesafety
declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  render(() => <RouterProvider router={router} />, rootElement)
}
