import { createTRPCReact } from '@trpc/react-query'

import type { AppRouter } from '../trpc'

const trpc = createTRPCReact<AppRouter>()

export default trpc
