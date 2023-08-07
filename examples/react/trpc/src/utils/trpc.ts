import { createTRPCReact } from '@trpc/react-query'
import { AppRouter } from '../server/trpc'

export const trpc = createTRPCReact<AppRouter>()
