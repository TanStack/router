import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/{-$slug}')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/b/{-$slug}"!'}</div>
}
