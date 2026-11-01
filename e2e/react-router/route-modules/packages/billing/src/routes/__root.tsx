import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({
  component: BillingRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted (with the URL it resolved to when the mount path has params).
function BillingRoom() {
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@route-modules/billing">
      <p className="room-tag">
        @route-modules/billing <code>{Route.fullPath}</code>
        {pathname !== Route.fullPath && (
          <code className="resolved">→ {pathname}</code>
        )}
      </p>
      <Outlet />
    </section>
  )
}
