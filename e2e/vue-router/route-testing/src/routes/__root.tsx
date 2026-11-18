import { defineComponent } from 'vue'
import { Link, Outlet, createRootRouteWithContext } from '@tanstack/vue-router'
import { fetchSession } from '../api'

export interface RouterContext {
  locale: string
}

const RootComponent = defineComponent({
  setup() {
    return () => (
      <>
        <nav aria-label="Main">
          <Link to="/">Home</Link>
        </nav>
        <Outlet />
      </>
    )
  },
})

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => ({ session: await fetchSession() }),
  component: RootComponent,
})
