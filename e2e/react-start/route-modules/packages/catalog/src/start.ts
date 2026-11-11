export type {} from './requirements'
import { createStartModule } from './routeScope.gen'
import { moneyAdapter } from './money'

export const start = createStartModule(() => ({
  // Contributed: `Money` values cross the network in every application route.
  serializationAdapters: [moneyAdapter],
}))
