import { Link, createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const cookieSchema = z
  .object({ value: z.string() })
  .catch(() => ({ value: `CLIENT-${Date.now()}` }))
export const Route = createFileRoute('/cookies/')({
  validateSearch: cookieSchema,
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch()
  return (
    <Link data-testid="link-to-set" from="/cookies" to="./set" search={search}>
      got to route that sets the cookies with {JSON.stringify(search)}
    </Link>
  )
}
