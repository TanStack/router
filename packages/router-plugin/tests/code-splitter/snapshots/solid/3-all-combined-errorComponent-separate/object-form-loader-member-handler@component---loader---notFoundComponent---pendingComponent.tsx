import { postsApi } from '../posts'
import { Route } from 'object-form-loader-member-handler.tsx'
function PostsComponent() {
  return <div class="p-2">{Route.useLoaderData()().length}</div>
}
const SplitLoader = postsApi.list
export { SplitLoader as loader }
export { PostsComponent as component }
