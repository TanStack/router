import * as React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { apiUtils, trpc } from '../utils/trpc'
import Spinner from '../components/Spinner'

export const Route = createFileRoute('/')({
  component: HomeComponent,
  loader: async () => {
    const helloData = await apiUtils.hello.ensureData()
    return {
      helloData,
    }
  },
})

function HomeComponent() {
  const { helloData } = Route.useLoaderData()
  const { data } = trpc.hello.useQuery(undefined, {
    initialData: helloData,
  })
  if (!data) return <Spinner />
  return <div className="p-2 text-xl">{data}</div>
}
