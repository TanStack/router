import { fetchPosts } from '../posts'
import { Route } from 'route-options-ts-wrappers.tsx'
function PostsComponent() {
  return <div class="p-2">{Route.useLoaderData()().length}</div>
}
const SplitLoader = () => fetchPosts()
export { SplitLoader as loader }
export { PostsComponent as component }
const SplitNotFoundComponent = () => <div class="p-2">not found</div>
export { SplitNotFoundComponent as notFoundComponent }
