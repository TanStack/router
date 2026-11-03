import { fetchPosts } from '../posts'
import { Route } from 'route-options-ts-wrappers.tsx'
function PostsComponent() {
  return <div className="p-2">{Route.useLoaderData().length}</div>
}
const SplitLoader = () => fetchPosts()
export { SplitLoader as loader }
export { PostsComponent as component }
const SplitNotFoundComponent = () => <div className="p-2">not found</div>
export { SplitNotFoundComponent as notFoundComponent }
