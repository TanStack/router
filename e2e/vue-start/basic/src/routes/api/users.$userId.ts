import { createFileRoute } from '@tanstack/vue-router'
import type { User } from '~/utils/users'

// resolved at request time (server-side only) so the built app picks up the
// dummy server the e2e harness starts — Playwright at test time, the vite
// config at prerender build time
function getQueryURL() {
  if (process.env.VITE_NODE_ENV === 'test') {
    return `http://localhost:${process.env.VITE_EXTERNAL_PORT}`
  }
  return 'https://jsonplaceholder.typicode.com'
}

export const Route = createFileRoute('/api/users/$userId')({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        console.info(`Fetching users by id=${params.userId}... @`, request.url)
        try {
          const res = await fetch(`${getQueryURL()}/users/${params.userId}`)
          if (!res.ok) {
            throw new Error('Failed to fetch user')
          }
          const user = (await res.json()) as User
          return Response.json({
            id: user.id,
            name: user.name,
            email: user.email,
          })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'User not found' }, { status: 404 })
        }
      },
    },
  },
})
