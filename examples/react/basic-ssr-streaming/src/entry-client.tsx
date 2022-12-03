import * as React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'

import { createRouter } from './router'

const router = createRouter()

const state = (window as any).__TANSTACK_ROUTER_STATE__

router.hydrate(state)

ReactDOM.hydrateRoot(document, <RouterProvider router={router} />)

// ReactDOM.createRoot(document.getElementById('root')!).render(
//   <RouterProvider router={router} />,
// )
