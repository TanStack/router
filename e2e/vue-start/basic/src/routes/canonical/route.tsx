import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/canonical')({
  head: () => ({
    links: [{ rel: 'canonical', href: 'https://example.com/canonical' }],
  }),
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/canonical"!</div>
}
