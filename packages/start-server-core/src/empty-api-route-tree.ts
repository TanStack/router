import type { AnyRoute } from '@tanstack/router-core'

// Bundlers that do not build the server-only route tree resolve this instead,
// which keeps every request on the Router path.
export const apiRouteTree: AnyRoute | undefined = undefined
