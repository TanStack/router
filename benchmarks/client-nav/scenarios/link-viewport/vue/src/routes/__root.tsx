import * as Vue from 'vue'
import { Link, Outlet, createRootRoute } from '@tanstack/vue-router'

const RootComponent = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <nav>
          <Link to="/" data-testid="go-home">
            Home
          </Link>
          <Link to="/list" data-testid="go-list">
            List
          </Link>
        </nav>
        <Outlet />
      </>
    )
  },
})

export const Route = createRootRoute({
  component: RootComponent,
})
