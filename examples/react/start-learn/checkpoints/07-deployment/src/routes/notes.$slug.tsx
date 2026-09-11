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
    const image = new URL('/images/field-notes-v1.png', loaderData.canonical)
      .href
    return {
      meta: [
        { title },
        { name: 'description', content: description },
        { property: 'og:title', content: title },
        { property: 'og:description', content: description },
        { property: 'og:url', content: loaderData.canonical },
        { property: 'og:type', content: 'website' },
        { property: 'og:image', content: image },
        { property: 'og:image:type', content: 'image/png' },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        {
          property: 'og:image:alt',
          content: 'An open notebook on a blue background',
        },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: title },
        { name: 'twitter:description', content: description },
        { name: 'twitter:image', content: image },
        {
          name: 'twitter:image:alt',
          content: 'An open notebook on a blue background',
        },
        {
          'script:ld+json': {
            '@context': 'https://schema.org',
            '@type': 'CreativeWork',
            name: loaderData.title,
            description,
            url: loaderData.canonical,
          },
        },
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
