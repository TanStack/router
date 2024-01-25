import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { fetchUserById } from '../utils/mockTodos'

export const Route = createFileRoute('/dashboard/users/user')({
  validateSearch: z.object({
    userId: z.number(),
  }),
  loaderDeps: ({ search: { userId } }) => ({ userId }),
  loader: ({ deps: { userId } }) => fetchUserById(userId),
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
