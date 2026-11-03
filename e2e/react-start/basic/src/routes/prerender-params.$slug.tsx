import { createFileRoute } from '@tanstack/react-router'
import z from 'zod'
import {
  SERVER_ONLY_PRERENDER_MARKER,
  getServerOnlyPrerenderSlug,
} from './-prerender-params.server'

const topLevelPrerenderLiteral =
  'top-level-prerender-literal-marker-should-not-ship'
const topLevelPrerenderImportedMarker = SERVER_ONLY_PRERENDER_MARKER.replace(
  'server-only-prerender-marker-should-not-be-in-client',
  'top-level-imported-marker-slug',
)
const topLevelPrerenderImportedCall = getServerOnlyPrerenderSlug().replace(
  'server-only-slug',
  'top-level-import-call-marker-should-not-ship',
)
const topLevelPrerenderSideEffect = (() => {
  ;(globalThis as any).__TSR_PRERENDER_SIDE_EFFECT_MARKER =
    'top-level-side-effect-prerender-marker-should-not-ship'
  return 'top-level-side-effect-slug'
})()

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
    yield {
      params: { slug: topLevelPrerenderLiteral },
    }
    yield {
      params: { slug: topLevelPrerenderImportedMarker },
    }
    yield {
      params: { slug: topLevelPrerenderImportedCall },
    }
    yield {
      params: { slug: topLevelPrerenderSideEffect },
    }
  },
  component: RouteComponent,
})

function RouteComponent() {
  const { slug } = Route.useParams()
  const search = Route.useSearch()

  return (
    <div>
      Prerendered slug: {slug}. Search page: {search.page ?? 'none'}. Search
      tag: {search.tag ?? 'none'}
    </div>
  )
}
