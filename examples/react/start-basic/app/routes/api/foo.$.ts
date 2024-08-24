import { json } from '@tanstack/start'
import { createApiRoute } from '@tanstack/start/server'

export const Route = createApiRoute('/api/foo/$')({
  GET: ({ request, params }) => {
    return json({ message: 'Hello /api/foo/$' })
  },
})
