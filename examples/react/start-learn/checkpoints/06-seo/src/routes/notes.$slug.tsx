import { createFileRoute, Link, notFound } from '@tanstack/react-router'
import { getNote } from '../server/notes'
export const Route = createFileRoute('/notes/$slug')({
  loader: async ({ params }) => {
    if (params.slug.length > 80) {
      throw notFound()
    }
    const note = await getNote({ data: params.slug })
    if (!note) {
      throw notFound()
    }
    return note
  },
  headers: () => ({ 'Cache-Control': 'no-store' }),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: 'Note not found | Field notes' },
          { name: 'robots', content: 'noindex' },
        ],
      }
    }
    const title = `${loaderData.title} | Field notes`
    const description = loaderData.body
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: loaderData.canonical },
        { property: 'og:type', content: 'website' },
      ],
      links: [{ rel: 'canonical', href: loaderData.canonical }],
    }
  },
  component: Note,
})
function Note() {
  const note = Route.useLoaderData()
  return (
    <main>
      <Link to="/" search={{ q: '' }}>
        All notes
      </Link>
      <h1>{note.title}</h1>
      <p>{note.body}</p>
    </main>
  )
}
