import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const getRemoteServerData = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getFederatedServerData } = await import('mf_remote/server-data')
    return getFederatedServerData('server-function')
  },
)

export const Route = createFileRoute('/server-fn-mf')({
  loader: () => getRemoteServerData(),
  component: ServerFunctionFederationRoute,
})

function ServerFunctionFederationRoute() {
  const response = Route.useLoaderData()

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '1rem' }}>
      <h2>Server function federation route</h2>
      <pre>{JSON.stringify(response)}</pre>
    </main>
  )
}
