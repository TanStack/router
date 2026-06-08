import { createFileRoute } from '@tanstack/react-router'
import { clearSession } from '@tanstack/react-start/server'

export const Route = createFileRoute('/api/session-clear')({
  server: {
    handlers: {
      POST: async () => {
        await clearSession({})
        return Response.json({ cleared: true })
      },
    },
  },
})
