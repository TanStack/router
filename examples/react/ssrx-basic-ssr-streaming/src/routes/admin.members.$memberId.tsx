import { createFileRoute, notFound } from '@tanstack/react-router'

import { getMember, sleep } from '~/utils.ts'

export const Route = createFileRoute('/admin/members/$memberId')({
  loader: async ({ params: { memberId } }) => {
    await sleep()

    const member = getMember(Number(memberId))
    if (!member) {
      throw notFound()
    }

    return { member }
  },
  component: AdminMember,
  notFoundComponent: NotFound,
})

function AdminMember() {
  const { member } = Route.useLoaderData()

  return <div>Member: {member.name}</div>
}

function NotFound() {
  return <div>member not found</div>
}
