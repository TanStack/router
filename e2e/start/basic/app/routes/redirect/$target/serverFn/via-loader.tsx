import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '~/components/throwRedirect'

export const Route = createFileRoute('/redirect/$target/serverFn/via-loader')({
  loaderDeps: ({ search: { reloadDocument } }) => ({ reloadDocument }),
  loader: ({ params: { target }, deps: { reloadDocument } }) =>
    throwRedirect({ data: { target, reloadDocument } }),
  component: () => <div>{Route.fullPath}</div>,
})
