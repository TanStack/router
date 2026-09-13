import { createFileRoute } from '@tanstack/react-router'
import { db } from '../server/db.server'
import { siteOrigin } from '../server/site.server'
export const Route = createFileRoute('/sitemap.txt')({
  server: {
    handlers: {
      GET: async () => {
        const notes = await db.note.findMany({
          where: { isPublished: true },
          select: { slug: true },
          orderBy: { slug: 'asc' },
        })
        const urls = [
          `${siteOrigin}/`,
          ...notes.map(
            (note) => `${siteOrigin}/notes/${encodeURIComponent(note.slug)}`,
          ),
        ]
        return new Response(`${urls.join('\n')}\n`, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      },
    },
  },
})
