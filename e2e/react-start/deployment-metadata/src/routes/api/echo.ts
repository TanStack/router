import { createFileRoute } from '@tanstack/react-router'
import { HEADER_CARRIER, MISSING } from '~/deployment-metadata.config'

export const Route = createFileRoute('/api/echo')({
  server: {
    handlers: {
      GET: ({ request }) =>
        new Response(request.headers.get(HEADER_CARRIER) ?? MISSING),
    },
  },
})
