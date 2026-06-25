import { Route as rootRoute } from './routes/__root'
import { Route as dataRoute } from './routes/data'
import { Route as listRoute } from './routes/data.list'
import { Route as itemRoute } from './routes/data.list.$itemId'
import { Route as staleRoute } from './routes/data.stale'
import { Route as blockingRoute } from './routes/data.blocking'
import { Route as conditionalRoute } from './routes/data.conditional'
import { Route as evictRoute } from './routes/data.evict.$bucketId'

export const routeTree = rootRoute.addChildren([
  dataRoute.addChildren([
    listRoute.addChildren([itemRoute]),
    staleRoute,
    blockingRoute,
    conditionalRoute,
    evictRoute,
  ]),
])
