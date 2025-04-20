import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'
import type { User } from '../../utils/users'

export const APIRoute = createAPIFileRoute('/api/users')({
  GET: async ({ request }) => {
    console.info('Fetching users... @', request.url)
    const res = await fetch('https://jsonplaceholder.typicode.com/users')
    if (!res.ok) {
      throw new Error('Failed to fetch users')
    }

    const data = (await res.json()) as Array<User>

    const list = data.slice(0, 10)

    return json(list.map((u) => ({ id: u.id, name: u.name, email: u.email })))
  },
})
