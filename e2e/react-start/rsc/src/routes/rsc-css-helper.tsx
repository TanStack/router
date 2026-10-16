import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { renderHelperCard } from '~/utils/renderHelperCard'
import { pageStyles } from '~/utils/styles'

const getHelperCard = createServerFn({ method: 'GET' }).handler(async () => {
  return renderHelperCard()
})

export const Route = createFileRoute('/rsc-css-helper')({
  loader: async () => ({ card: await getHelperCard() }),
  component: RscCssHelperComponent,
})

function RscCssHelperComponent() {
  const { card } = Route.useLoaderData()

  return (
    <div style={pageStyles.container} data-testid="rsc-css-helper-page">
      <h1 style={pageStyles.title}>RSC CSS from a helper module</h1>
      <p style={pageStyles.description}>
        The server function of this route calls a helper module that renders a
        server component with renderServerComponent.
      </p>
      {card}
    </div>
  )
}
