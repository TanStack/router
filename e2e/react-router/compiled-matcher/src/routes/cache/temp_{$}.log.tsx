import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/cache/temp_{$}/log')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/cache/temp_{$}.log"!'}</div>
}
