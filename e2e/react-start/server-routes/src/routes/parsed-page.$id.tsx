import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/parsed-page/$id')({
  params: {
    parse: (params) => {
      const id = Number(params.id)
      if (!Number.isFinite(id)) {
        throw notFound()
      }
      return { id }
    },
    stringify: (params) => ({ id: String(params.id) }),
  },
  server: {
    handlers: {
      GET: ({ request, next, params }) => {
        if (request.headers.get('accept')?.includes('text/html')) {
          return next()
        }
        const id: number = params.id
        return Response.json({ id })
      },
    },
  },
  component: ParsedPage,
})

function ParsedPage() {
  const { id } = Route.useParams()
  return <div data-testid="parsed-page">{JSON.stringify({ id })}</div>
}
