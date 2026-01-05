// This file is manually created for now (no file-based routing plugin for RN yet)
import { Route as rootRoute } from './routes/__root'
import { Route as indexRoute } from './routes/index'
import { Route as aboutRoute } from './routes/about'
import { Route as postsRoute } from './routes/posts'
import { Route as postRoute } from './routes/posts.$postId'
import { Route as deepPostRoute } from './routes/posts.$postId.deep'

// Flat route structure - all routes are direct children of root
// Each route defines its full path from root
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
  postsRoute,
  postRoute,
  deepPostRoute,
])

export { routeTree }
