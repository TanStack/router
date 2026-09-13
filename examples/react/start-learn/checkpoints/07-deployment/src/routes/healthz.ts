import { createFileRoute } from '@tanstack/react-router'
import { db } from '../server/db.server'
export const Route = createFileRoute('/healthz')({
  server: {
    handlers: {
      GET: async () => {
        try {
          await db.$queryRaw`SELECT 1`
          return new Response('ok', {
            headers: {
              'Cache-Control': 'no-store',
              'Content-Type': 'text/plain; charset=utf-8',
            },
          })
        } catch {
          return new Response('unavailable', {
            status: 503,
            headers: {
              'Cache-Control': 'no-store',
              'Content-Type': 'text/plain; charset=utf-8',
            },
          })
        }
      },
    },
  },
})
