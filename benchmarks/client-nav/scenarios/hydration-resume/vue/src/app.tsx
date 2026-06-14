import * as Vue from 'vue'
import { RouterProvider } from '@tanstack/vue-router'
import { hydrate } from '@tanstack/router-core/ssr/client'
import {
  createDashboardHydrationFixture,
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

function mountRouterProvider(
  container: Element,
  router: ReturnType<typeof createHydrationResumeRouter>,
) {
  const app = Vue.createApp({
    render: () => <RouterProvider router={router} />,
  })

  app.mount(container)

  return app
}

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
  let app: Vue.App<Element> | undefined = undefined

  try {
    await hydrate(router)
    window.$_TSR?.h()
    app = mountRouterProvider(container, router)
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
      app?.unmount()
    },
  }
}

export function mountTestApp(container: Element) {
  const fixture = createDashboardHydrationFixture(0)
  hydrationResumeRuntime.startCycle(fixture)

  const router = getRouter()
  const app = mountRouterProvider(container, router)
  let didUnmount = false

  return {
    router,
    unmount() {
      if (didUnmount) {
        return
      }

      didUnmount = true
      app.unmount()
    },
  }
}
