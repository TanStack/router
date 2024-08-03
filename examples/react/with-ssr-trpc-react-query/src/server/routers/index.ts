import { createCallerFactory, router } from '../trpc.ts'
import blogRouter from './blog/index.ts'

export const appRouter = router({
  blog: blogRouter,
})

export const createCaller = createCallerFactory(appRouter)
