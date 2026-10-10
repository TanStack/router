import { createFileRoute, Link } from '@tanstack/react-router'
import { readThroughRpc } from '~/utils/execution-functions'

export const Route = createFileRoute('/execution-rpc')({
  loader: () => readThroughRpc(),
  component: Result,
})

function Result() {
  return (
    <>
      <p data-testid="execution-result">{Route.useLoaderData()}</p>
      <Link to="/execution-local" preload={false}>
        Call the server-only helper directly
      </Link>
    </>
  )
}
