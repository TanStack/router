import { Outlet } from '@tanstack/react-router'
import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({
  component: () => {
    return (
      <div className="p-2">
        <Outlet />
      </div>
    )
  },
})
