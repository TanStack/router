import { FileRoute, lazyRouteComponent } from '@tanstack/react-router'

export const Route = new FileRoute('/expensive/').createRoute({
  component: lazyRouteComponent(() => import('./-components/Expensive')),
  loader: () => ({ emoji: '😉' }),
})
