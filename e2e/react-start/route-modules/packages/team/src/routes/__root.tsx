import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

// The organization comes from the host route the application mounts the team
// under, so the team works below any route that provides it.
export const Route = createModuleRoot<{ org: { id: string; name: string } }>()({
  component: TeamLayout,
})

// The module's region: a room tagged with its package and where it is
// mounted, with the URL its mount path resolved to.
function TeamLayout() {
  const { org } = Route.useRouteContext()
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@start-route-modules/team">
      <p className="room-tag">
        @start-route-modules/team <code>{Route.fullPath}</code>
        <code className="resolved">→ {pathname}</code>
      </p>
      <h2>{`Team of ${org.name}`}</h2>
      <Outlet />
    </section>
  )
}
