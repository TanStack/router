import SuperJSON from 'superjson'
import { initTRPC } from '@trpc/server'

const { createCallerFactory, procedure, router } = initTRPC.create({
  transformer: SuperJSON,
})

export { createCallerFactory, procedure, router }
