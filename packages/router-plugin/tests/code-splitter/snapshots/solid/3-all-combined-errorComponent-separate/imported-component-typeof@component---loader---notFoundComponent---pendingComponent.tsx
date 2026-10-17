import { fetchPosts } from '../posts'
import { PostsComponent } from '../posts-component'
type PostsData = Awaited<ReturnType<typeof fetchPosts>>
type PostsProps = Parameters<typeof PostsComponent>[0]
const SplitLoader = fetchPosts
export { SplitLoader as loader }
const SplitComponent = PostsComponent
export { SplitComponent as component }
