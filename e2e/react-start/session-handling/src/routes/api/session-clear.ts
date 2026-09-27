import { createFileRoute } from '@tanstack/react-router'
import { destroySession } from '~/session'

export const Route = createFileRoute('/api/session-clear')({
  server: {
    handlers: {
      POST: async () => {
        await destroySession()
        return Response.json({ cleared: true })
      },
    },
  },
})
