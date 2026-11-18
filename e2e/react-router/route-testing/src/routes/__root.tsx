import {
  Link,
  Outlet,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { fetchSession } from '../api'

export interface RouterContext {
  locale: string
}

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => ({ session: await fetchSession() }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <>
      <nav aria-label="Main">
        <Link to="/">Home</Link>
      </nav>
      <Outlet />
    </>
  )
}
