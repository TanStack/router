import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/{-$slug}')({
  component: RouteComponent,
})

function RouteComponent() {
  return <div>{'Hello "/posts/{-$slug}"!'}</div>
}
