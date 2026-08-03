import { createFileRoute } from '@tanstack/solid-router'
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
  *prerenderParams() {
    yield {
      params: { slug: 'hello-world' },
      sitemap: {
        lastmod: '2026-05-05',
        priority: 0.8,
      },
    }
    yield {
      params: { slug: '대한민국' },
      sitemap: {
        priority: 0.6,
      },
    }
    yield {
      params: { slug: 'reserved?hash#plus+' },
      sitemap: {
        exclude: true,
      },
    }
    yield {
      params: { slug: 'with-query' },
      search: { page: 2, tag: 'router start' },
      sitemap: {
        priority: 0.4,
      },
    }
    yield {
      params: { slug: getServerOnlyPrerenderSlug() },
      sitemap: {
        exclude: true,
      },
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()
  const search = Route.useSearch()

  return (
    <div>
      Prerendered slug: {params().slug}. Search page: {search().page ?? 'none'}.
      Search tag: {search().tag ?? 'none'}
    </div>
  )
}
