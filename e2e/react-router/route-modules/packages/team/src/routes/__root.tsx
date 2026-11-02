import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

// The organization comes from the host route the application mounts the team
// under, so the team works below any route that provides it.
export const Route = createModuleRoot<{ org: { id: string; name: string } }>()({
  component: TeamRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted (with the URL it resolved to when the mount path has params).
function TeamRoom() {
  const { org } = Route.useRouteContext()
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@route-modules/team">
      <p className="room-tag">
        @route-modules/team <code>{Route.fullPath}</code>
        {pathname !== Route.fullPath && (
          <code className="resolved">→ {pathname}</code>
        )}
      </p>
      <h2>Team of {org.name}</h2>
      <Outlet />
    </section>
  )
}
