import { json } from '@tanstack/start'
import { createApiRoute } from '@tanstack/start/server'

export const Route = createApiRoute('/api/hello')({
  GET: ({ request, params }) => {
    return json({ message: 'Hello /api/hello' })
  },
})
