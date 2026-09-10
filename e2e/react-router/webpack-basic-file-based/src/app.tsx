import { RouterProvider, createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  scrollRestoration: true,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const App = () => {
  return <RouterProvider router={router} />
}

export default App
