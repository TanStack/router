import { rootRoute } from './routes/__root'
import { stateRoute } from './routes/state'
import { sectionRoute } from './routes/state.$section'
import { itemRoute } from './routes/state.$section.$itemId'

export const routeTree = rootRoute.addChildren([
  stateRoute.addChildren([sectionRoute.addChildren([itemRoute])]),
])
