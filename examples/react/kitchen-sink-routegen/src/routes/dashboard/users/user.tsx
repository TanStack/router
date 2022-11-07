import * as React from 'react'
import { router } from '../../../router'
import { fetchUserById } from '../../../mockTodos'
import usersRoute from '../users'

const routeDef = usersRoute.createRoute({
  path: ':userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  element: <User />,
  loader: async ({ params: { userId } }) => {
    return {
      user: await fetchUserById(userId),
      test: true,
    }
  },
})

export default routeDef

function User() {
  const {
    loaderData: { user },
  } = router.useMatch(routeDef.id)

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
