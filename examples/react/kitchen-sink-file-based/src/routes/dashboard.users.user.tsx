import * as React from 'react'
import { FileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { fetchUserById } from '../utils/mockTodos'

export const Route = new FileRoute('/dashboard/users/user').createRoute({
  validateSearch: z.object({
    userId: z.number(),
  }),
  loader: ({ search: { userId } }) => fetchUserById(userId),
  component: UserComponent,
})

function UserComponent() {
  const user = Route.useLoaderData()

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
