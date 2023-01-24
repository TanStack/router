import * as React from 'react'
import { fetchUserById } from '../../../mockTodos'
import { usersRoute } from '.'
import { Loader, useLoaderInstance } from '@tanstack/react-loaders'
import { useParams } from '@tanstack/react-router'
import { loaderClient } from '../../../loaderClient'

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

export const userRoute = usersRoute.createRoute({
  path: '$userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  component: User,
  onLoad: async ({ params: { userId } }) => {
    return {
      user: await fetchUserById(userId),
    }
  },
})

function User() {
  const { userId } = useParams({ from: userRoute.id })
  const userLoaderInstance = useLoaderInstance({
    key: userLoader.key,
    variables: userId,
  })
  const user = userLoaderInstance.state.data

  return (
    <>
      <h4 className="p-2 font-bold">{user?.name}</h4>
      <pre className="text-sm whitespace-pre-wrap">
        {JSON.stringify(user, null, 2)}
      </pre>
    </>
  )
}
