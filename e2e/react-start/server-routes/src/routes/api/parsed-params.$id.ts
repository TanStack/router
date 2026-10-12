import { createFileRoute, notFound } from '@tanstack/react-router'

export const Route = createFileRoute('/api/parsed-params/$id')({
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
      GET: ({ params }) => {
        const id: number = params.id
        return Response.json({ id })
      },
    },
  },
})
