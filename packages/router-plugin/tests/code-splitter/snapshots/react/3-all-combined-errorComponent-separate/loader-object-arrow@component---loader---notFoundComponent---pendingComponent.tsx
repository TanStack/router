import { fetchPost } from '../posts'
import { Route } from 'loader-object-arrow.tsx'
function PostComponent() {
  const post = Route.useLoaderData()
  return <div>{post.title}</div>
}
const SplitLoader = async ({ params }) => fetchPost(params.postId)
export { SplitLoader as loader }
export { PostComponent as component }
