import { reloadMode } from 'loader-object-method.tsx?tsr-shared=1'
import { fetchPosts } from '../posts'
const SplitLoader = async function ({ abortController }) {
  const posts = await fetchPosts({ signal: abortController.signal })
  return { posts, reloadMode }
}
export { SplitLoader as loader }
const SplitComponent = () => <div>posts</div>
export { SplitComponent as component }
