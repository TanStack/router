import { t } from '@lingui/core/macro'
import { Trans } from '@lingui/react/macro'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: RouteComponent,
  loader(ctx) {
    return {
      serverMessage: t`This is from the loader.`,
    }
  },
})

function RouteComponent() {
  const { serverMessage } = Route.useLoaderData()

  return (
    <main>
      <h1>
        <Trans>About</Trans>
      </h1>
      <p>{serverMessage}</p>
    </main>
  )
}
