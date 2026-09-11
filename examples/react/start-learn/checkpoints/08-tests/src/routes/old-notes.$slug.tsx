import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import { getNote } from '../server/notes'

export const Route = createFileRoute('/old-notes/$slug')({
  beforeLoad: async ({ params }) => {
    if (params.slug.length > 80) {
      throw notFound()
    }
    const note = await getNote({ data: params.slug })
    if (!note) {
      throw notFound()
    }
    throw redirect({
      to: '/notes/$slug',
      params: { slug: note.slug },
      statusCode: 308,
      headers: { 'Cache-Control': 'no-store' },
    })
  },
  headers: () => ({ 'Cache-Control': 'no-store' }),
})
