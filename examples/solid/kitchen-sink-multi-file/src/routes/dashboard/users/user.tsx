import { Loader, useLoaderInstance } from '@tanstack/solid-loaders'
import { Route, useParams } from '@tanstack/solid-router'
import { usersRoute } from '.'
import { loaderClient } from '../../../loaderClient'
import { fetchUserById } from '../../../mockTodos'

export const userLoader = new Loader({
  key: 'user',
  loader: async (userId: number) => {
    console.log(`Fetching user with id ${userId}...`)
    return fetchUserById(userId)
  },
  onAllInvalidate: async () => {
    await loaderClient
      .getLoader({
        key: 'users',
      })
      .invalidateAll()
  },
})

export const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: '$userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  component: () => <User />,
  onLoad: async ({ params: { userId }, preload }) =>
    userLoader.load({ variables: userId, preload }),
})

function User() {
  const params = useParams({ from: userRoute.id })
  const userLoaderInstance = useLoaderInstance({
    key: userLoader.key,
    variables: params.userId,
  })

  const user = userLoaderInstance.state.data

  return (
    <>
      <h4 class="p-2 font-bold">{user?.name}</h4>
      <pre class="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
