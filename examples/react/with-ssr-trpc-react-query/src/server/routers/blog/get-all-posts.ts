import blogPosts from '../../data.ts'
import { procedure } from '../../trpc.ts'

const getAllPosts = procedure.query(() => blogPosts)

export default getAllPosts
