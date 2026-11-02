import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

// Account pages need the signed-in user, provided by whatever host route the
// application mounts the module under.
export const Route = createModuleRoot<{ user: { id: string } }>()({
  component: AccountRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted (with the URL it resolved to when the mount path has params).
function AccountRoom() {
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@route-modules/account">
      <p className="room-tag">
        @route-modules/account <code>{Route.fullPath}</code>
        {pathname !== Route.fullPath && (
          <code className="resolved">→ {pathname}</code>
        )}
      </p>
      <Outlet />
    </section>
  )
}
