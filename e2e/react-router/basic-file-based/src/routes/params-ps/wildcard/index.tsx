import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute({
  beforeLoad: () => {
    throw redirect({ to: '/params' })
  },
})
