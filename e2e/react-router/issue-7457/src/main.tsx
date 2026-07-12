import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  defaultPendingComponent: DefaultPendingComponent,
  defaultPreloadStaleTime: 0,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function DefaultPendingComponent() {
  ;(globalThis as any).__pendingSeen = true

  return <div data-testid="app-pending">loading</div>
}

createRoot(document.body).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
