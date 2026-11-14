import { createFileRoute } from '@tanstack/react-router'
import { fetchPost } from '../../api'
import { PostHeader } from '../../components/PostHeader'
import type { SearchSchemaInput } from '@tanstack/react-router'

export type PostTab = 'details' | 'comments'

export const Route = createFileRoute('/_authed/posts/$postId')({
  validateSearch: (
    search: { tab?: string } & SearchSchemaInput,
  ): { tab: PostTab } => {
    if (search.tab === undefined || search.tab === 'details') {
      return { tab: 'details' }
    }
    if (search.tab === 'comments') {
      return { tab: 'comments' }
    }
    throw new Error(`Unknown tab "${search.tab}"`)
  },
  loader: async ({ params }) => ({ post: await fetchPost(params.postId) }),
  component: PostPage,
})

function PostPage() {
  const { tab } = Route.useSearch()

  return (
    <article>
      <PostHeader />
      <section aria-label="Tab content">
        {tab === 'comments' ? 'Comments' : 'Details'}
      </section>
    </article>
  )
}
