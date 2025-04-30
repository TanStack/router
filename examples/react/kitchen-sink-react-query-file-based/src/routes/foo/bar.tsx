
import { z } from 'zod'

export const Route = createFileRoute({
  component: () => <div>{JSON.stringify(Route.useSearch())}</div>,
  validateSearch: z.object({ asdf: z.string() }),
})
