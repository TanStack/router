import { json } from '@tanstack/start'
import { createApiRoute } from '@tanstack/start/server'

export const Route = createApiRoute('/api/boo/$id/name/$')({
  GET: ({ request, params }) => {
    const id = params.id
    return json({ message: 'Hello /api/boo/$id/name/$' })
  },
  POST: async ({ request }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return new Response(request.url)
  },
})
