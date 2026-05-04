import { createRoot } from '@remix-run/ui'
import { RouterProvider, mountRouter } from '@tanstack/remix-router'
import { makeRouter } from './router'

const router = makeRouter()
await mountRouter(router)

const root = createRoot(document.getElementById('app')!)
root.render(<RouterProvider router={router} />)
