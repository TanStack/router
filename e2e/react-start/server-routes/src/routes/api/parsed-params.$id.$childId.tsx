import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/parsed-params/$id/$childId')({
  params: {
    parse: (params) => ({ childId: Number(params.childId) }),
    stringify: (params) => ({ childId: String(params.childId) }),
  },
  server: {
    handlers: ({ createHandlers }) =>
      createHandlers({
        GET: {
          handler: ({ params, request, next }) => {
            if (new URL(request.url).searchParams.has('render')) {
              return next({ context: { handlerParams: params } })
            }
            const id: string = params.id
            const childId: string = params.childId
            return Response.json({ id, childId })
          },
        },
      }),
  },
  loader: ({ params, serverContext }) => ({
    loaderParams: params,
    handlerParams: serverContext?.handlerParams,
  }),
  component: () => (
    <pre data-testid="parsed-params">
      {JSON.stringify(Route.useLoaderData())}
    </pre>
  ),
})
