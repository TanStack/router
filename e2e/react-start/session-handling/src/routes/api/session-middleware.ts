import { createFileRoute } from '@tanstack/react-router'
import { sessionMiddleware } from '~/start'

export const Route = createFileRoute('/api/session-middleware')({
  server: {
    middleware: [sessionMiddleware],
    handlers: {
      GET: ({ context }) => Response.json({ data: { ...context.session } }),
    },
  },
})
