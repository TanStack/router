import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/api/foo/$')({
  GET: ({ request, params }) => {
    return json({ message: 'Hello /api/foo/$' })
  },
})
