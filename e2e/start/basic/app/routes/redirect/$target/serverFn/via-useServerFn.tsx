import { createFileRoute } from '@tanstack/react-router'
import { RedirectOnClick } from '~/components/RedirectOnClick'

export const Route = createFileRoute(
  '/redirect/$target/serverFn/via-useServerFn',
)({
  component: () => {
    const { target } = Route.useParams()
    const { reloadDocument } = Route.useSearch()
    return <RedirectOnClick target={target} reloadDocument={reloadDocument} />
  },
})
