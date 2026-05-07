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
    {
      params: { slug: topLevelPrerenderLiteral },
      sitemap: {
        exclude: true,
      },
    },
    {
      params: { slug: topLevelPrerenderImportedMarker },
      sitemap: {
        exclude: true,
      },
    },
    {
      params: { slug: topLevelPrerenderImportedCall },
      sitemap: {
        exclude: true,
      },
    },
    {
      params: { slug: topLevelPrerenderSideEffect },
      sitemap: {
        exclude: true,
      },
    },
  ],
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
