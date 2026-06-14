import { Route as rootRoute } from './routes/__root'
import { Route as headRoute } from './routes/head'
import { Route as articlesRoute } from './routes/head.articles'
import { Route as articleRoute } from './routes/head.articles.$articleId'
import { Route as productRoute } from './routes/head.products.$productId'
import { Route as settingsRoute } from './routes/head.settings'

export const routeTree = rootRoute.addChildren([
  headRoute.addChildren([
    articlesRoute.addChildren([articleRoute]),
    productRoute,
    settingsRoute,
  ]),
])
