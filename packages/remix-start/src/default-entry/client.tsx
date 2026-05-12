/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { createRoot } from '@remix-run/ui'
import { RouterProvider, mountRouter } from '@tanstack/remix-router'
// The plugin resolves `#tanstack-router-entry` to the user's router
// module — typically `src/router.{ts,tsx}` exporting `getRouter()`.
// @ts-ignore Virtual module resolved at build time.
import { getRouter } from '#tanstack-router-entry'

const router = await getRouter()
await mountRouter(router)

const root = createRoot(document.getElementById('app')!)
root.render(<RouterProvider router={router} />)
