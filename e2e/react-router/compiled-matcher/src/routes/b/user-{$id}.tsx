import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/b/user-{$id}')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/b/user-{$id}"!'}</div>
}
