import { createFileRoute, Link } from '@tanstack/react-router'
import z from 'zod'

export const Route = createFileRoute('/encoding/link-active/$target')({
  validateSearch: z.object({ foo: z.string().optional() }),

  component: RouteComponent,
})

function RouteComponent() {
  return (
    <Link
      data-testid="self-link"
      activeProps={{ className: 'font-bold' }}
      activeOptions={{ includeSearch: true }}
      to="/encoding/link-active/$target"
      params={{ target: Route.useParams().target }}
      search={Route.useSearch()}
    >
      link to self with $target={Route.useParams().target}, search.foo=
      {Route.useSearch().foo}
    </Link>
  )
}
