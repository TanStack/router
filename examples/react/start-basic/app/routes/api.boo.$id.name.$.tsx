import { json } from '@tanstack/start'
import { createAPIRoute } from '@tanstack/start/api'

export const Route = createAPIRoute('/api/boo/$id/name/$')({
  GET: ({ request, params }) => {
    const id = params.id
    return json({ message: 'Hello /api/boo/$id/name/$' })
  },
  POST: async ({ request }) => {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return new Response(request.url)
  },
})
