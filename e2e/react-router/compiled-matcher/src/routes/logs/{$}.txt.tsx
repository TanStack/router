import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/logs/{$}/txt')({
	component: RouteComponent,
})

function RouteComponent() {
	return <div>{'Hello "/logs/{$}.txt"!'}</div>
}
