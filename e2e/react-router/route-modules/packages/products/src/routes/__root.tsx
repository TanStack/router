import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
import type { ProductsApi } from '../api'

export const Route = createModuleRoot<{ productsApi: ProductsApi }>()({
  component: ProductsRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted (with the URL it resolved to when the mount path has params).
function ProductsRoom() {
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@route-modules/products">
      <p className="room-tag">
        @route-modules/products <code>{Route.fullPath}</code>
        {pathname !== Route.fullPath && (
          <code className="resolved">→ {pathname}</code>
        )}
      </p>
      <Outlet />
    </section>
  )
}
