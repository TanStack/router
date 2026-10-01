import * as Vue from 'vue'
import {
  Link,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/vue-router'
import { isServer } from '@tanstack/router-core/isServer'

export const serverEnvironment = isServer
export const linkCount = 200

export async function mountTestApp(
  container: HTMLElement,
  reactiveCount: number,
) {
  const value = Vue.ref(0)
  let gridRenders = 0
  // Construct callbacks and destination props once. Only callback bodies read
  // the ref, so its updates cannot cause the grid to retarget Link props.
  const destinations = Array.from({ length: linkCount }, (_, index) => ({
    params: { id: `item-${index}` },
    search:
      index < reactiveCount
        ? () => ({ value: value.value })
        : () => ({ value: 0 }),
  }))
  const rootRoute = createRootRoute({
    component: Vue.defineComponent({
      setup() {
        return () => {
          gridRenders++
          return (
            <nav>
              {destinations.map((destination, index) => (
                <Link
                  key={index}
                  to="/items/$id"
                  params={destination.params}
                  search={destination.search}
                  data-reactive-link={index}
                >
                  Item {index}
                </Link>
              ))}
            </nav>
          )
        }
      },
    }),
  })
  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/' }),
    createRoute({ getParentRoute: () => rootRoute, path: '/items/$id' }),
  ])
  const history = createMemoryHistory({ initialEntries: ['/'] })
  const router = createRouter({
    routeTree,
    history,
    defaultPreload: false,
    scrollRestoration: false,
  })
  await router.load()
  const app = Vue.createApp({
    render: () => <RouterProvider router={router} />,
  })
  app.mount(container)
  await Vue.nextTick()

  return {
    router,
    currentValue: () => value.value,
    gridRenderCount: () => gridRenders,
    async tick() {
      value.value = value.value === 0 ? 1 : 0
      await Vue.nextTick()
    },
    unmount() {
      app.unmount()
      history.destroy()
    },
  }
}
