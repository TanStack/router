import { createFileRoute } from '@tanstack/react-router'
import { cancelledStreams } from './-tracked-streams'

export const Route = createFileRoute('/api/tracked-stream')({
  server: {
    handlers: {
      // A body that never ends, like a live feed. Only cancellation stops it.
      GET: ({ request }) => {
        const id = new URL(request.url).searchParams.get('id') ?? ''
        return new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('tracked'))
            },
            cancel() {
              cancelledStreams.add(id)
            },
          }),
        )
      },
    },
  },
})
