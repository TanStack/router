import { createFileRoute } from '@tanstack/react-router'
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/params-ps/named/')({
  beforeLoad: () => {
    throw redirect({ to: '/params-ps' })
  },
})
