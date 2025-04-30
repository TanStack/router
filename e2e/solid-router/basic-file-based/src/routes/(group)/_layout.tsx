import { Outlet } from '@tanstack/solid-router'

export const Route = createFileRoute({
  component: () => (
    <>
      <div>/(group)/_layout!</div>
      <Outlet />
    </>
  ),
})
