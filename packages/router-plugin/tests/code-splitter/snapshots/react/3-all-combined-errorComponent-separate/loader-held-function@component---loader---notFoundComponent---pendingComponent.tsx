import { fetchPosts } from '../posts'
// a function the compiler can see: split without the object-form mark
const loadPosts = async () => fetchPosts()
export { loadPosts as loader }
const SplitComponent = () => <p>posts</p>
export { SplitComponent as component }
