import { createServerFn } from './routeScope.gen'

/** The members of an organization, loaded on the server. */
export const listMembers = createServerFn()
  .validator((orgId: string) => orgId)
  .handler(({ data }) =>
    ['ada', 'grace'].map((name) => ({ id: name, label: `${name} (${data})` })),
  )
