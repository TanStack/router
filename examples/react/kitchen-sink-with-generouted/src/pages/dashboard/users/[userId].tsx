import { Loader as _Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { useParams } from '@tanstack/react-router'

import { loaderClient } from '@/routes.gen'
import { fetchUserById } from '@/utils/mock'

export const Loader = new _Loader({
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

export const Config = {
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  onLoad: async ({ params: { userId }, preload }) => Loader.load({ variables: userId, preload }),
}

export default function User() {
  const { userId } = useParams({ from: '/dashboard/users/$userId' })
  const userLoaderInstance = useLoaderInstance({
    key: 'user',
    variables: userId,
  })
  const user = userLoaderInstance.state.data

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">{JSON.stringify(user, null, 2)}</pre>
    </>
  )
}
