import * as React from 'react'
import { fetchUserById } from '../../../mockTodos'
import { usersLoader, usersRoute } from '.'
import { Loader } from '@tanstack/react-loaders'
import { Route } from '@tanstack/router'

export const userLoader = new Loader({
  fn: async (userId: number) => {
    console.log(`Fetching user with id ${userId}...`)
    return fetchUserById(userId)
  },
  onInvalidate: async () => {
    await usersLoader.invalidate()
  },
})

export const userRoute = new Route({
  getParentRoute: () => usersRoute,
  path: '$userId',
  parseParams: ({ userId }) => ({ userId: Number(userId) }),
  stringifyParams: ({ userId }) => ({ userId: `${userId}` }),
  loader: async ({ context, params: { userId }, preload }) => {
    const { userLoader } = context.loaderClient.loaders

    const userLoaderInstance = userLoader.getInstance({
      variables: userId,
    })

    await userLoaderInstance.load({
      preload,
    })

    return () => userLoaderInstance.useInstance()
  },
  component: function User({ useLoader }) {
    const {
      state: { data: user },
    } = useLoader()()

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
