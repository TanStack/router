import getAllPosts from './get-all-posts.ts'
import getPostByID from './get-post-by-id.ts'
import { router } from '../../trpc.ts'

export const blogRouter = router({
  getAllPosts,
  getPostByID,
})

export default blogRouter
