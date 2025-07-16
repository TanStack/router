import { z } from 'zod'

export const Route = createFileRoute({
  validateSearch: z.object({
    default: z.string().default('d1'),
  }),
  beforeLoad: ({ context }) => {
    if (context.hello !== 'world') {
      throw new Error('Context hello is not "world"')
    }
  },
  loader: ({ context }) => {
    if (context.hello !== 'world') {
      throw new Error('Context hello is not "world"')
    }
  },
  component: () => {
    const search = Route.useSearch()
    const context = Route.useRouteContext()
    return (
      <>
        <div data-testid="search-default">{search.default}</div>
        <div data-testid="context-hello">{context.hello}</div>
      </>
    )
  },
})
