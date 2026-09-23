import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn, createServerFn } from '@tanstack/react-start'

const getData = createServerFn({ method: 'GET' }).handler(() => 'loaded')
const getRuntime = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

export const Route = createFileRoute('/')({
  loader: async () => ({ runtime: getRuntime(), data: await getData() }),
  component: Page,
})

function Page() {
  const { runtime, data } = Route.useLoaderData()
  return (
    <main>
      Root document hydration
      <output data-testid="loader-runtime">{runtime}</output>
      <output data-testid="loader-data">{data}</output>
    </main>
  )
}
