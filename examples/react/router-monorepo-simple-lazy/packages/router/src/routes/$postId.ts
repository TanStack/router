
import { fetchPost } from '../fetch/posts'

export const Route = createFileRoute({
  loader: ({ params }) => fetchPost(params.postId),
})
