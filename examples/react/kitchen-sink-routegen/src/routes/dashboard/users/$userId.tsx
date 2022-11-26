import * as React from 'react'
import { fetchUserById } from '../../../mockTodos'
import { routeConfig } from '../../../routes.generated/dashboard/users/$userId'
import { useMatch } from '@tanstack/react-router'

routeConfig.generate({
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  component: User,
  loader: async ({ params: { userId } }) => {
    return {
      user: await fetchUserById(userId),
      test: true,
    }
  },
})

function User() {
  const {
    loaderData: { user },
  } = useMatch(routeConfig.id)

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
