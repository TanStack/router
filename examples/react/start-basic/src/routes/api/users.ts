import { createMiddleware, json } from '@tanstack/react-start'
import type { User } from '~/utils/users'

const userLoggerMiddleware = createMiddleware().server(({ next, request }) => {
  console.info('Request on /users... @', request.url)
  return next()
})

export const ServerRoute = createServerFileRoute()
  .middleware([userLoggerMiddleware])
  .methods({
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
