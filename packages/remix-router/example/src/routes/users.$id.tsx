import { createRoute, subscribeMatch } from '@tanstack/remix-router'
import { Route as UsersRoute } from './users'
import type { Handle } from '@remix-run/ui'

interface User {
  id: number
  name: string
  bio: string
}

function UserDetail(handle: Handle) {
  const match = subscribeMatch(handle, '/users/$id')
  return () => {
    const user = match()?.loaderData as User | undefined
    if (!user) return <p>Not found.</p>
    return (
      <article>
        <h2>{user.name}</h2>
        <p>{user.bio}</p>
      </article>
    )
  }
}

export const Route = createRoute({
  getParentRoute: () => UsersRoute,
  path: '$id',
  loader: async ({ params }: { params: { id: string } }) => {
    const id = Number(params.id)
    return {
      id,
      name: `User #${id}`,
      bio: 'Placeholder bio. Replace with a real server function call.',
    } satisfies User
  },
  component: UserDetail,
})
