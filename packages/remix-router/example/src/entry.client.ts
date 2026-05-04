import { run } from '@remix-run/ui'
import { mountRouter, RouterProvider } from '@tanstack/remix-router'
import { createRoot } from '@remix-run/ui'
import { makeRouter } from './router'

const router = makeRouter()
await mountRouter(router)

// `@remix-run/ui` mounts the document tree via `run()` for stream-rendered
// markup, or `createRoot()` for client-only mounting. We use `createRoot()`
// here because the example is CSR-first; SSR hydration would use `run()`
// against the SSR-rendered DOM and the matching dehydrated payload.
const root = createRoot(document.body)
root.render(<RouterProvider router={router} />)

void run({
  loadModule: (url: string) => import(/* @vite-ignore */ url),
})
