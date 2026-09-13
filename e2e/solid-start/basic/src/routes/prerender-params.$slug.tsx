import { createFileRoute } from '@tanstack/solid-router'
import z from 'zod'
import { getServerOnlyPrerenderSlug } from './-prerender-params.server'

export const Route = createFileRoute('/prerender-params/$slug')({
  validateSearch: z.object({
    page: z.number().optional(),
    tag: z.string().optional(),
  }),
  *prerenderParams() {
    yield {
      params: { slug: 'hello-world' },
    }
    yield {
      params: { slug: '대한민국' },
    }
    yield {
      params: { slug: 'reserved?hash#plus+' },
    }
    yield {
      params: { slug: 'with-query' },
      search: { page: 2, tag: 'router start' },
    }
    yield {
      params: { slug: getServerOnlyPrerenderSlug() },
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
