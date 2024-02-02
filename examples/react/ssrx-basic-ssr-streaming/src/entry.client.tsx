import { RouterProvider } from '@tanstack/react-router'
// import { StrictMode } from 'react';
import { hydrateRoot } from 'react-dom/client'

import { createRouter } from '~/router.tsx'

void render()

async function render() {
  const router = createRouter()

  if (!router.state.lastUpdated) {
    await router.load() // needed until https://github.com/TanStack/router/issues/1115 is resolved
    void router.hydrate()
  }

  hydrateRoot(document, <RouterProvider router={router} />)
}
