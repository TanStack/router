import { fetchPost } from '../posts'
const SplitLoader = async ({ params }) => fetchPost(params.postId)
export { SplitLoader as loader }
