import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, Router } from '@tanstack/router'
import { rootRoute } from './routes/root/rootRoute'
import { postsRoute } from './routes/posts/postsRoute'
import { postRoute } from './routes/posts/post/postRoute'
import { postsIndexRoute } from './routes/posts/post/postsIndexRoute'
import { indexRoute } from './routes/index/indexRoute'
import { LoaderClientProvider } from '@tanstack/react-loaders'
import { loaderClient } from './loaderClient'

const routeTree = rootRoute.addChildren([
  postsRoute.addChildren([postRoute, postsIndexRoute]),
  indexRoute,
])

// Set up a Router instance
const router = new Router({
  routeTree,
  defaultPreload: 'intent',
  context: {
    loaderClient,
  },
})

// Register things for typesafety
declare module '@tanstack/router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)

  root.render(
    // <React.StrictMode>
    <LoaderClientProvider client={loaderClient}>
      <RouterProvider router={router} />
    </LoaderClientProvider>,
    // </React.StrictMode>,
  )
}
