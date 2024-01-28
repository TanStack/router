import { QueryClient } from '@tanstack/react-query'
import { httpBatchLink } from '@trpc/client'
import { createTRPCQueryUtils, createTRPCReact } from '@trpc/react-query'
import { AppRouter } from '../../../server/server'

export const trpc = createTRPCReact<AppRouter>()

export const queryClient = new QueryClient()

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: 'http://localhost:4000',

      // optional
      headers() {
        return {
          // authorization: getAuthCookie(),
        }
      },
    }),
  ],
})

// We will use this in the route loaders
export const apiUtils = createTRPCQueryUtils({
  client: trpcClient,
  queryClient,
})
