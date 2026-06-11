import { createFileRoute } from '@tanstack/solid-router'
import { echoGet, echoPost } from '../fns'

export const Route = createFileRoute('/api/fn-urls')({
  server: {
    handlers: {
      GET: () => Response.json({ get: echoGet.url, post: echoPost.url }),
    },
  },
})
