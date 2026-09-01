import { generateHydrationScript, renderToString } from 'solid-js/web'
import { RouterProvider } from '../src'
import { createAppRouter } from './app.shared'
import { serializeRouterMatches } from './registry-transfer'

export async function render(): Promise<{
  appHtml: string
  hydrationScript: string
}> {
  const { router } = createAppRouter()
  await router.load()
  // Registry transfer runs inside the render (the serialization context is
  // per-render): a component-body call, exactly where a provider would do it.
  const appHtml = await renderToString(() => {
    serializeRouterMatches(router)
    return <RouterProvider router={router} />
  })
  return { appHtml, hydrationScript: generateHydrationScript() }
}
