import { Route as rootRoute } from './routes/__root'
import { Route as deferredIndexRoute } from './routes/deferred'
import { Route as itemRoute } from './routes/deferred.items.$itemId'
import { Route as detailsRoute } from './routes/deferred.items.$itemId.details'
import { Route as reportRoute } from './routes/deferred.reports.$reportId'

export const routeTree = rootRoute.addChildren([
  deferredIndexRoute,
  itemRoute.addChildren([detailsRoute]),
  reportRoute,
])
