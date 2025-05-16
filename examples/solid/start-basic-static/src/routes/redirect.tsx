import { redirect } from '@tanstack/solid-router'

export const Route = createFileRoute({
  beforeLoad: async () => {
    throw redirect({
      to: '/posts',
    })
  },
})
