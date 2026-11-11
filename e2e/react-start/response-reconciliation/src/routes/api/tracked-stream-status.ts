import { createFileRoute } from '@tanstack/react-router'
import { cancelledStreams } from './-tracked-streams'

export const Route = createFileRoute('/api/tracked-stream-status')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return Response.json({ cancelled: cancelledStreams.has(id) })
      },
    },
  },
})
