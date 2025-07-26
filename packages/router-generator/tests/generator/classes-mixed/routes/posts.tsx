import { FileRoute } from '@tanstack/react-router'

export const Route = new FileRoute('/posts').createRoute({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>Hello "/posts"!</div>
}
