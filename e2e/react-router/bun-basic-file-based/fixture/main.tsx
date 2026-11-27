import { createRoot } from 'react-dom/client'
import { createRouter, RouterProvider } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree, defaultPreload: false })

createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)
