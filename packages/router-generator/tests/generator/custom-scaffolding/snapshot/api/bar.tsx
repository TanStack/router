import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

export const APIRoute = createAPIFileRoute('/api/bar')({
  GET: ({ request, params }) => {
    return json({ message: 'Hello /api/test' })
  },
})
