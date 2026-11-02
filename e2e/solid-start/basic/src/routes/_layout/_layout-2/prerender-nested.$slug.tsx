import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute(
  '/_layout/_layout-2/prerender-nested/$slug',
)({
  prerenderParams: () => [{ params: { slug: 'under-layout' } }],
  component: RouteComponent,
})

function RouteComponent() {
  const params = Route.useParams()

  return <div>Nested prerendered slug: {params().slug}</div>
}
