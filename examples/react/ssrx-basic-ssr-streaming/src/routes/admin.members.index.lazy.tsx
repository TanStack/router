import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/admin/members/')({
  component: AdminMembersHome,
})

function AdminMembersHome() {
  return <div>Click a member to the left..</div>
}
