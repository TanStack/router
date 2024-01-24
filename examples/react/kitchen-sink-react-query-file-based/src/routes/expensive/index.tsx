import { createFileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/expensive/')({
  component: lazyRouteComponent(() => import('./-components/Expensive')),
})
