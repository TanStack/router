// import { hydrateRoot } from 'react-dom/client'
// import { StartClient } from '@tanstack/start'
// import { createRouter } from './router'

// const router = createRouter()

// hydrateRoot(document.getElementById('root')!, <StartClient router={router} />)

import React from 'react'
import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(
  document.getElementById('root')!,
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
