import { Outlet } from '@tanstack/react-router'
import crypto from 'node:crypto'
import { createModuleRoot } from '../routeScope.gen'
export const Route = createModuleRoot()({
  ssr: () => {
    if (crypto.randomInt(0, 2) === 0) {
      return 'data-only'
    }
    return false
  },
  component: () => {
    return (
      <div className="p-2">
        <Outlet />
      </div>
    )
  },
})
