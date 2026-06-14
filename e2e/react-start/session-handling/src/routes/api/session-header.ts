import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '~/session'

export const Route = createFileRoute('/api/session-header')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const sessionHeader = url.searchParams.get('name') || undefined
        return Response.json(
          await readSession({ cookie: false, sessionHeader }),
        )
      },
    },
  },
})
