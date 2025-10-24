import { createFileRoute } from '@tanstack/solid-router'
import { json } from '@tanstack/solid-start'
import axios from 'redaxios'
import type { User } from '../../utils/users'

export const Route = createFileRoute('/api/users')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        console.info('Fetching users... @', request.url)
        const res = await axios.get<Array<User>>(
          'https://jsonplaceholder.typicode.com/users',
        )
        const list = res.data.slice(0, 10)
        return json(
          list.map((u) => ({ id: u.id, name: u.name, email: u.email })),
        )
      },
    },
  },
})
