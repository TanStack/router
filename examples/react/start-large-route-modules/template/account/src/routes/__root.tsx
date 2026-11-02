import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({
  component: AccountLayout,
})

function AccountLayout() {
  return (
    <section className="module">
      <p className="module-tag">
        @large-route-modules/account <code>{Route.fullPath}</code>
      </p>
      <h2>Account</h2>
      <Outlet />
    </section>
  )
}
