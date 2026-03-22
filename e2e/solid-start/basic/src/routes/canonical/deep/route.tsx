import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/canonical/deep')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://example.com/canonical/deep' }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/canonical/deep"!</div>
}
