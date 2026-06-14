import { rootRoute } from './routes/__root'
import { detailRoute } from './routes/scroll.list.$listId.detail.$itemId'
import { listRoute } from './routes/scroll.list.$listId'
import { scrollRoute } from './routes/scroll'
import { staticRoute } from './routes/scroll.static'

export const routeTree = rootRoute.addChildren([
  scrollRoute.addChildren([listRoute.addChildren([detailRoute]), staticRoute]),
])
