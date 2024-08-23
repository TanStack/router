import { json } from '@tanstack/start'
import { createApiRoute } from '@tanstack/start/server'

export const route = createApiRoute('/api/foo/$')({
  GET: ({ request, params }) => {
    params
    return json({ message: 'Hello /api/foo/$' })
  },
})
