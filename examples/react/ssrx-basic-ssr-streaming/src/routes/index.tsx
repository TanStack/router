import { Await, createFileRoute, defer } from '@tanstack/react-router'
import { Suspense } from 'react'

import { rand, sleep } from '~/utils.ts'

export const Route = createFileRoute('/')({
  loader: async () => {
    const deferred = loadData(1000, 'deferred')
    const critical = await loadData(100, 'critical')

    return {
      critical,
      deferred: defer(deferred),
    }
  },
  component: IndexComponent,
  meta: () => [
    {
      title: 'Home',
    },
  ],
})

function IndexComponent() {
  const { critical, deferred } = Route.useLoaderData()

  return (
    <div>
      <h2>Home</h2>

      <p>
        This home route simply loads some data (with a simulated delay) and
        displays it.
      </p>

      <p>{critical}</p>

      <Suspense fallback={<p>Loading deferred...</p>}>
        <Await promise={deferred}>{(data) => <p>{data}</p>}</Await>
      </Suspense>
    </div>
  )
}

async function loadData(delay: number, name: string) {
  await sleep(delay)

  return `Home loader - ${name} - random value ${rand()}.`
}
