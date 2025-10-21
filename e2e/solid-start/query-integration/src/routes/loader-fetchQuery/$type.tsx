import { useQuery } from '@tanstack/solid-query'
import { createFileRoute } from '@tanstack/solid-router'
import z from 'zod'
import { makeQueryOptions } from '~/queryOptions'

export const Route = createFileRoute('/loader-fetchQuery/$type')({
  component: RouteComponent,
  params: {
    parse: ({ type }) =>
      z
        .object({
          type: z.union([z.literal('sync'), z.literal('async')]),
        })
        .parse({ type }),
  },
  context: ({ params }) => ({
    queryOptions: makeQueryOptions(`loader-fetchQuery-${params.type}`),
  }),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(context.queryOptions)
    if (params.type === 'sync') {
      return context.queryClient.getQueryData(
        context.queryOptions.queryKey,
      ) as string
    }
    return undefined as any
  },
})

function RouteComponent() {
  const params = Route.useParams()
  const loaderData = Route.useLoaderData()
  const query = useQuery(() => {
    return makeQueryOptions(`loader-fetchQuery-${params().type}`)
  })

  return (
    <div>
      <div>
        loader data:{' '}
        <div data-testid="loader-data">{loaderData() ?? 'undefined'}</div>
      </div>
      <div>
        query data:{' '}
        <div data-testid="query-data">{query.data ?? 'loading...'}</div>
      </div>
    </div>
  )
}
