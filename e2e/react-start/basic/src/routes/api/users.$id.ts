import { createFileRoute } from '@tanstack/react-router'
import axios from 'redaxios'
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

export const Route = createFileRoute('/api/users/$id')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        console.info(`Fetching users by id=${params.id}... @`, request.url)
        try {
          const res = await axios.get<User>(`${getQueryURL()}/users/` + params.id)

          return Response.json({
            id: res.data.id,
            name: res.data.name,
            email: res.data.email,
          })
        } catch (e) {
          console.error(e)
          return Response.json({ error: 'User not found' }, { status: 404 })
        }
      },
    },
  },
})
