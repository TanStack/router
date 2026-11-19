import { createFileRoute } from '@tanstack/react-router'
import { readSecret } from '../../server-only'

// A route with nothing for the client: Start leaves it out of the client's route tree.
export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true, secret: readSecret() }),
    },
  },
})
