import * as React from 'react'
import { fetchUserById } from '../../../mockTodos'
import { usersRoute } from '.'
import { useLoaderData, useMatch } from '@tanstack/react-router'

export const userRoute = usersRoute.createRoute({
  path: '$userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  component: User,
  loader: async ({ params: { userId } }) => {
    return {
      user: await fetchUserById(userId),
    }
  },
})

function User() {
  const { user } = useLoaderData({ from: userRoute.id })

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
