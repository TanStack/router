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

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        console.info('Fetching users... @', request.url)
        const res = await axios.get<Array<User>>(`${getQueryURL()}/users`)

        const list = res.data.slice(0, 10)

        return Response.json(
          list.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        )
      },
    },
  },
})
