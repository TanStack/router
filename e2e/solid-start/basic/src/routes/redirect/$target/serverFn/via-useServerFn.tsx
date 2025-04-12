
import { RedirectOnClick } from '~/components/RedirectOnClick'

export const Route = createFileRoute({
  component: () => {
    const params = Route.useParams()
    const search = Route.useSearch()
    return (
      <RedirectOnClick
        target={params().target}
        reloadDocument={search().reloadDocument}
        externalHost={search().externalHost}
      />
    )
  },
})
