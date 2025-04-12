
import { throwRedirect } from '~/components/throwRedirect'

export const Route = createFileRoute({
  loaderDeps: ({ search: { reloadDocument, externalHost } }) => ({
    reloadDocument,
    externalHost,
  }),
  loader: ({ params: { target }, deps: { reloadDocument, externalHost } }) =>
    throwRedirect({ data: { target, reloadDocument, externalHost } }),
  component: () => <div>{Route.fullPath}</div>,
})
