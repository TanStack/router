import { RouterProvider } from '@tanstack/react-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import { createRoot } from 'react-dom/client'
import {
  createStandaloneHydrationFixture,
  seedHydrationResumeSsrGlobal,
  type HydrationResumeFixture,
} from '../../shared.ts'
import {
  createHydrationResumeRouter,
  getHydrationResumeRouteIds,
  getRouter,
} from './router'
import { hydrationResumeRuntime } from './runtime'

export { hydrationResumeRuntime } from './runtime'

export async function mountHydratedTestApp(
  container: Element,
  fixture: HydrationResumeFixture,
) {
  hydrationResumeRuntime.startCycle(fixture)

  const router = createHydrationResumeRouter(fixture.href)
  const cleanup = seedHydrationResumeSsrGlobal(
    router,
    getHydrationResumeRouteIds(),
    hydrationResumeRuntime,
    fixture,
  )
  let didUnmount = false
  let reactRoot: ReturnType<typeof createRoot> | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    reactRoot = createRoot(container)
    reactRoot.render(<RouterProvider router={router} />)
  } catch (error) {
    cleanup()
    router.history.destroy()
    hydrationResumeRuntime.clearCycle()
    throw error
  }

  return {
    router,
    cleanup,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot?.unmount()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createStandaloneHydrationFixture()
  hydrationResumeRuntime.startCycle(fixture)

  const router = getRouter()
  const reactRoot = createRoot(container)
  let didUnmount = false

  reactRoot.render(<RouterProvider router={router} />)

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      reactRoot.unmount()
    },
  }
}
