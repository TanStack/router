import { createFileRoute } from '@tanstack/react-router'

import { trpc } from '../router'

export const Route = createFileRoute('/dashboard/')({
  loader: async ({ context: { trpcQueryUtils } }) => {
    await trpcQueryUtils.posts.ensureData()
    return
  },
  component: DashboardIndexComponent,
})

function DashboardIndexComponent() {
  const postsQuery = trpc.posts.useQuery()

  const posts = postsQuery.data || []

  return (
    <div className="p-2">
      <div className="p-2">
        Welcome to the dashboard! You have{' '}
        <strong>{posts.length} total posts</strong>.
      </div>
    </div>
  )
}
