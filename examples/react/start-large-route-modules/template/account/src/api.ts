import { createServerFn } from './routeScope.gen'

/** The signed-in account, loaded on the server. */
export const getAccount = createServerFn().handler(() => ({
  name: 'Ada Lovelace',
  plan: 'Team',
  seats: 12,
}))
