/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useLoaderData, createFileRoute } from '@tanstack/remix-router'
import { renderUserBio } from '../server/renderers'
import { Route as UsersRoute } from './users'
import type { Handle } from '@remix-run/ui'

function UserDetail(handle: Handle) {
  const readUserBio = useLoaderData(handle, { from: '/users/$id' })
  return () => {
    const html = readUserBio()
    return html ? <article innerHTML={html} /> : <p>Not found.</p>
  }
}

export const Route = createFileRoute('/users/$id')({
  getParentRoute: () => UsersRoute,
  path: '$id',
  loader: ({ params }: { params: { id: string } }) => {
    const id = Number(params.id)
    return renderUserBio({
      data: {
        id,
        name: `User #${id}`,
        bio: 'Placeholder bio. Replace with a real server function call.',
      },
    })
  },
  component: UserDetail,
})
