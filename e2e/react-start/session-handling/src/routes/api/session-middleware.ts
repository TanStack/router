import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '~/session'

export const Route = createFileRoute('/api/session-middleware')({
  server: {
    handlers: {
      GET: async () => {
        return Response.json(await readSession())
      },
    },
  },
})
