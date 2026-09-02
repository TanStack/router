import { generateHydrationScript, renderToStream } from 'solid-js/web'
import { RouterProvider } from '../src'
import { createAppRouter } from './app.shared'

// No transfer code and no `await router.load()`: RouterProvider owns the
// server dispatch (parking the render on it) and serializes settled match
// state into the hydration registry itself. The parked read requires the
// async renderer — renderToString is synchronous by design in Solid 2.
// Chunks are captured individually so the harness can assert streaming
// order (shell with fallback first, deferred values later).
export async function render(): Promise<{
  appHtml: string
  hydrationScript: string
  chunks: Array<string>
}> {
  const { router } = createAppRouter()
  const chunks: Array<string> = []
  const appHtml = await new Promise<string>((resolve) => {
    renderToStream(() => <RouterProvider router={router} />).pipe({
      write: (v) => chunks.push(v),
      end: () => resolve(chunks.join('')),
    })
  })
  return { appHtml, hydrationScript: generateHydrationScript(), chunks }
}
