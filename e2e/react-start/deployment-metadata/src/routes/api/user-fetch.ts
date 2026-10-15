import { createFileRoute } from '@tanstack/react-router'
import { HEADER_CARRIER, MISSING } from '~/deployment-metadata.config'

export const Route = createFileRoute('/api/user-fetch')({
  server: {
    handlers: {
      GET: ({ request }) =>
        // return deployment header, or "missing" if it's not present
        new Response(request.headers.get(HEADER_CARRIER) ?? MISSING),
    },
  },
})
