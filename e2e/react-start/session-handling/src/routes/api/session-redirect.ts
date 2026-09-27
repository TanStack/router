import { createFileRoute, redirect } from '@tanstack/react-router'
import { updateSessionData } from '~/session'

export const Route = createFileRoute('/api/session-redirect')({
  server: {
    handlers: {
      POST: async () => {
        await updateSessionData({ user: 'redirected' })
        throw redirect({ href: '/api/session', statusCode: 303 })
      },
    },
  },
})
