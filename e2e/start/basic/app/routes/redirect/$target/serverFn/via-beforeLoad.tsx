import { createFileRoute } from '@tanstack/react-router'
import { throwRedirect } from '~/components/throwRedirect'

export const Route = createFileRoute(
  '/redirect/$target/serverFn/via-beforeLoad',
)({
  beforeLoad: ({ params: { target } }) => throwRedirect(target),
  component: () => <div>{Route.fullPath}</div>,
})
