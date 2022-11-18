import * as React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { createRouter } from './router'
import { App } from './App'

const state = (window as any).__TANSTACK_ROUTER_STATE__

const router = createRouter()

router.hydrateState(state)

ReactDOM.hydrateRoot(
  document.getElementById('root')!,
  <RouterProvider router={router}>
    <App />
  </RouterProvider>,
)
