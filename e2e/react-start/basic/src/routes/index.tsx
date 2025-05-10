import { CustomMessage } from '~/components/CustomMessage'
import { fetchDatabaseUrl } from '~/utils/test-env'

export const Route = createFileRoute({
  component: Home,
  loader: async () => {
    return {
      databaseUrl: await fetchDatabaseUrl(),
    }
  },
})

function Home() {
  const { databaseUrl } = Route.useLoaderData()
  return (
    <div className="p-2">
      <h3>Welcome Home!!!</h3>
      <CustomMessage message="Hello from a custom component!" />
      <h3>DATABASE_URL: {databaseUrl}</h3>
    </div>
  )
}
