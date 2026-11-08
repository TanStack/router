import { createFileRoute } from '@tanstack/react-router'
import { readOnlyOnServer } from '~/utils/execution-functions'

// This intentionally fails during browser navigation. It is the negative case
// for the environment-functions troubleshooting guide.
export const Route = createFileRoute('/execution-local')({
  loader: () => readOnlyOnServer(),
  component: Result,
  errorComponent: ({ error }) => (
    <p role="alert">{error instanceof Error ? error.message : String(error)}</p>
  ),
})

function Result() {
  return <p data-testid="execution-result">{Route.useLoaderData()}</p>
}
