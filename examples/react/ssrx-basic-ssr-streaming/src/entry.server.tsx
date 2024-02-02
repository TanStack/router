import { renderAssets } from '@ssrx/react/server'
import { assetsForRequest } from '@ssrx/vite/runtime'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'

// import { StrictMode } from 'react';
import { createRouter } from '~/router.tsx'

export async function render(req: Request) {
  const assets = await assetsForRequest(req.url)

  const router = createRouter({
    context: {
      headTags: () => renderAssets(assets.headAssets),
      bodyTags: () => renderAssets(assets.bodyAssets),
    },
  })

  const url = new URL(req.url)
  const memoryHistory = createMemoryHistory({
    initialEntries: [url.pathname + url.search],
  })

  router.update({ history: memoryHistory })

  // Wait for critical, non-deferred data
  await router.load()

  const app = <RouterProvider router={router} />

  return { app, router }
}
