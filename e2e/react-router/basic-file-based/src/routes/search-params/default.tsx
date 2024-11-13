import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'

export const Route = createFileRoute('/search-params/default')({
  validateSearch: zodValidator(
    z.object({
      default: z.string().default('d1'),
      optional: z.string().optional(),
    }),
  ),
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  return (
    <>
      <div data-testid="search-default">{search.default}</div>
      <div data-testid="search-optional">{search.optional ?? '$undefined'}</div>
    </>
  )
}
