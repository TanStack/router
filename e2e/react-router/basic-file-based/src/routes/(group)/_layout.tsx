import { Outlet } from '@tanstack/react-router'

export const Route = createFileRoute({
  component: () => (
    <>
      <div>/(group)/_layout!</div>
      <Outlet />
    </>
  ),
})
