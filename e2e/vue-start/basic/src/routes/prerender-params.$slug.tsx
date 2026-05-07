import { createFileRoute } from '@tanstack/vue-router'
import z from 'zod'
import { getServerOnlyPrerenderSlug } from './-prerender-params.server'

export const Route = createFileRoute('/prerender-params/$slug')({
  validateSearch: z.object({
    page: z.number().optional(),
    tag: z.string().optional(),
  }),
  sitemap: {
    changefreq: 'weekly',
  },
  prerenderParams: () => [
    {
      params: { slug: 'hello-world' },
      sitemap: {
        lastmod: '2026-05-05',
        priority: 0.8,
      },
    },
    {
      params: { slug: '대한민국' },
      sitemap: {
        priority: 0.6,
      },
    },
    {
      params: { slug: 'reserved?hash#plus+' },
      sitemap: {
        exclude: true,
      },
    },
    {
      params: { slug: 'with-query' },
      search: { page: 2, tag: 'router start' },
      sitemap: {
        priority: 0.4,
      },
    },
    {
      params: { slug: getServerOnlyPrerenderSlug() },
      sitemap: {
        exclude: true,
      },
    },
  ],
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  const search = Route.useSearch()

  return (
    <div>
      Prerendered slug: {params.value.slug}. Search page:{' '}
      {search.value.page ?? 'none'}. Search tag: {search.value.tag ?? 'none'}
    </div>
  )
}
