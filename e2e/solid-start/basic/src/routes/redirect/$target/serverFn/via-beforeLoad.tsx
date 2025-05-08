import { throwRedirect } from '~/components/throwRedirect'

export const Route = createFileRoute({
  beforeLoad: ({
    params: { target },
    search: { reloadDocument, externalHost },
  }) => throwRedirect({ data: { target, reloadDocument, externalHost } }),
  component: () => <div>{Route.fullPath}</div>,
})
