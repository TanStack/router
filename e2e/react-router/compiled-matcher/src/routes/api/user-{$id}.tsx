import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/user-{$id}')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/api/user-{$id}"!'}</div>
}
