import { createServerFileRoute } from '@tanstack/solid-start/server'
import { json } from '@tanstack/solid-start'
import type { User } from '~/utils/users'

let queryURL = 'https://jsonplaceholder.typicode.com'

if (import.meta.env.VITE_NODE_ENV === 'test') {
  queryURL = `http://localhost:${import.meta.env.VITE_EXTERNAL_PORT}`
}

export const ServerRoute = createServerFileRoute('/api/users/$userId').methods({
  GET: async ({ params, request }) => {
    console.info(`Fetching users by id=${params.userId}... @`, request.url)
    try {
      const res = await fetch(`${queryURL}/users/${params.userId}`)
      if (!res.ok) {
        throw new Error('Failed to fetch user')
      }

      const user = (await res.json()) as User

      return json({
        id: user.id,
        name: user.name,
        email: user.email,
      })
    } catch (e) {
      console.error(e)
      return json({ error: 'User not found' }, { status: 404 })
    }
  },
})
