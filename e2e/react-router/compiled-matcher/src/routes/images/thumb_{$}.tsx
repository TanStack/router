import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/images/thumb_{$}')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/images/thumb_{$}"!'}</div>
}
