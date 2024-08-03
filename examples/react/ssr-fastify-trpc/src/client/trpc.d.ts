import type {
  createTRPCReact,
  inferReactQueryProcedureOptions,
} from '@trpc/react-query'
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server'

import type { appRouter, createCaller } from '../server/routers/index.ts'

export type AppRouter = typeof appRouter
export type Caller = ReturnType<typeof createCaller>
export type ReactQueryOptions = inferReactQueryProcedureOptions<AppRouter>
export type RouterInputs = inferRouterInputs<AppRouter>
export type RouterOutputs = inferRouterOutputs<AppRouter>
export type TRPC = ReturnType<typeof createTRPCReact<AppRouter>>
