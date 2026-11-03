import { Outlet } from '@tanstack/react-router'
import { createFileRoute } from '../routeScope.gen'

export const Route = createFileRoute('@route-modules/products:/_layout')({
  component: () => (
    <div>
      <Outlet />
    </div>
  ),
})
