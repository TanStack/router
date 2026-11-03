import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: () => ({ user: { id: 'u-1' } }),
  component: () => <Outlet />,
})
