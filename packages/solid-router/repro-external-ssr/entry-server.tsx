import { generateHydrationScript, renderToString } from 'solid-js/web'
import { RouterProvider } from '../src'
import { createAppRouter } from './app.shared'

// No transfer code: RouterProvider serializes settled match state into the
// hydration registry itself.
export async function render(): Promise<{
  appHtml: string
  hydrationScript: string
}> {
  const { router } = createAppRouter()
  await router.load()
  const appHtml = await renderToString(() => <RouterProvider router={router} />)
  return { appHtml, hydrationScript: generateHydrationScript() }
}
