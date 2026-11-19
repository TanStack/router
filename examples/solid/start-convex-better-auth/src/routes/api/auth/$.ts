import { createFileRoute } from '@tanstack/solid-router'
import { authHandler } from '~/library/auth-server'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => {
        return authHandler(request)
      },
      POST: ({ request }) => {
        return authHandler(request)
      },
    },
  },
})
