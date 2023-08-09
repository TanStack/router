import * as React from 'react'
import { fetchUserById } from '../../../mockTodos'
import { usersLoader, usersRoute } from '.'
import {
  createLoaderOptions,
  Loader,
  typedClient,
  useLoaderInstance,
} from '@tanstack/react-loaders'
import { Route } from '@tanstack/react-router'

export const userLoader = new Loader({
  key: 'user',
  fn: async (userId: number) => {
    console.log(`Fetching user with id ${userId}...`)
    return fetchUserById(userId)
  },
  onInvalidate: async ({ client }) => {
    typedClient(client).invalidateLoader({ key: 'users' })
  },
})

export const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: '$userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  loader: async ({
    context: { loaderClient },
    params: { userId },
    preload,
  }) => {
    const loaderOptions = createLoaderOptions({
      key: 'user',
      variables: userId,
    })

    await loaderClient.load({
      ...loaderOptions,
      preload,
    })

    return () => useLoaderInstance(loaderOptions)
  },
  component: function User({ useLoader }) {
    const { data: user } = useLoader()()

    return (
      <>
        <h4 className="p-2 font-bold">{user?.name}</h4>
        <pre className="text-sm whitespace-pre-wrap">
          {JSON.stringify(user, null, 2)}
        </pre>
      </>
    )
  },
})
