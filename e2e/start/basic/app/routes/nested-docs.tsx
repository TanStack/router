import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/nested-docs')({
  component: () => (
    <div className="p-2">
      <Outlet />
    </div>
  ),
})
