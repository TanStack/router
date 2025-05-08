import { fetchPosts } from '../fetch/posts'

export const Route = createFileRoute({
  loader: () => {
    return fetchPosts()
  },
})
