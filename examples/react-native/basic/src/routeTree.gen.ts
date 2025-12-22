// This file is manually created for now (no file-based routing plugin for RN yet)
import { Route as rootRoute } from './routes/__root'
import { Route as indexRoute } from './routes/index'
import { Route as aboutRoute } from './routes/about'
import { Route as postsRoute } from './routes/posts'
import { Route as postRoute } from './routes/posts.$postId'

// Type assertion needed due to complex generic variance issues
// These don't affect runtime - just TypeScript strict mode
const routeTree = (rootRoute as any).addChildren([
  indexRoute as any,
  aboutRoute as any,
  (postsRoute as any).addChildren([postRoute as any]),
])

export { routeTree }
