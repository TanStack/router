import { json } from '@tanstack/start'
import { createAPIRoute } from '@tanstack/start/api'

export const Route = createAPIRoute('/api/hello')({
  GET: ({ request, params }) => {
    return json({ message: 'Hello /api/hello' })
  },
})
