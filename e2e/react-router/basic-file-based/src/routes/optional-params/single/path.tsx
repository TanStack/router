import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/optional-params/single/path')({
  component: RouteComponent,
})

function RouteComponent() {
  return (
    <div data-testid="single-path-heading">
      Hello "/optional-params/single/path"!
    </div>
  )
}
