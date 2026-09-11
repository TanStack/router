import { createFileRoute } from '@tanstack/react-router'
import { auth } from '../../../server/auth.server'
export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => auth.handler(request),
      POST: ({ request }) => auth.handler(request),
    },
  },
})
