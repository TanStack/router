import { createServerFn } from './routeScope.gen'

/** The profile of an owner, loaded on the server. */
export const getProfile = createServerFn()
  .validator((owner: { kind: string; id: string }) => owner)
  .handler(({ data }) => ({ kind: data.kind, handle: `@${data.id}` }))
