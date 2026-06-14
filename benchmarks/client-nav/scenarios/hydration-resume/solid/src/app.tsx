import { render } from 'solid-js/web'
import { RouterProvider } from '@tanstack/solid-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
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
  let dispose: (() => void) | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    dispose = render(() => <RouterProvider router={router} />, container)
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
      dispose?.()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createStandaloneHydrationFixture()
  hydrationResumeRuntime.startCycle(fixture)

  const router = getRouter()
  const dispose = render(() => <RouterProvider router={router} />, container)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      dispose()
    },
  }
}
