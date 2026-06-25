import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({
      to: '/another',
      replace: true,
    })
  },
  component: RouteComponent,
})

function RouteComponent() {
  return <div>You should never see this!</div>
}
