import * as React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { router } from './router'
import { App } from './App'

const state = (window as any).__TANSTACK_ROUTER_STATE__

router.hydrateState(state)

ReactDOM.hydrateRoot(
  document.getElementById('root')!,
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
)

// ReactDOM.createRoot(document.getElementById('root')!).render(
//   <RouterProvider router={router}>
//     <App />
//   </RouterProvider>,
// )
