import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
import type { ProductsApi } from '@route-modules/products/api'

// The products module mounted below requires `productsApi`: the storefront
// requires it from its own host and passes it on.
export const Route = createModuleRoot<{ productsApi: ProductsApi }>()({
  component: StorefrontRoom,
})

// The module's region: a room tagged with its package and where it is
// mounted (with the URL it resolved to when the mount path has params).
function StorefrontRoom() {
  const pathname = Route.useMatch({ select: (match) => match.pathname })
  return (
    <section className="room" data-route-module="@route-modules/storefront">
      <p className="room-tag">
        @route-modules/storefront <code>{Route.fullPath}</code>
        {pathname !== Route.fullPath && (
          <code className="resolved">→ {pathname}</code>
        )}
      </p>
      <Outlet />
    </section>
  )
}
