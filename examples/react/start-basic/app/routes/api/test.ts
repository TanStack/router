import { json } from '@tanstack/start'
import { createApiRoute } from '@tanstack/start/server'

export const route = createApiRoute('/api/test/$')({
  GET: ({ request, params }) => {
    params
    return json({ hello: 'world' })
  },
})
