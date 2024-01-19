import * as React from 'react'
import { FileRoute, Link, RouteApi } from '@tanstack/react-router'
import { apiUtils, trpc } from '../utils/trpc'
import Spinner from '../components/Spinner'

export const Route = new FileRoute('/').createRoute({
  component: HomeComponent,
  loader: async () => {
    const helloData = await apiUtils.hello.ensureData()
    return {
      helloData,
    }
  },
})
const api = new RouteApi({ id: '/' })

function HomeComponent() {
  const { helloData } = api.useLoaderData()
  const { data } = trpc.hello.useQuery(undefined, {
    initialData: helloData,
  })
  if (!data) return <Spinner />
  return <div className="p-2 text-xl">{data}</div>
}
