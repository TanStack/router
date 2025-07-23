import { createServerFileRoute } from '@tanstack/react-start/server'
import { json } from '@tanstack/react-start'
import axios from 'redaxios'

import type { User } from '~/utils/users'

let queryURL = 'https://jsonplaceholder.typicode.com'

if (import.meta.env.VITE_NODE_ENV === 'test') {
  queryURL = `http://localhost:${import.meta.env.VITE_EXTERNAL_PORT}`
}

export const ServerRoute = createServerFileRoute('/api/users').methods({
  GET: async ({ request }) => {
    console.info('Fetching users... @', request.url)
    const res = await axios.get<Array<User>>(`${queryURL}/users`)

    const list = res.data.slice(0, 10)

    return json(list.map((u) => ({ id: u.id, name: u.name, email: u.email })))
  },
})
