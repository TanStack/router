import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/$a/$b')({
  component: Outlet,
})
