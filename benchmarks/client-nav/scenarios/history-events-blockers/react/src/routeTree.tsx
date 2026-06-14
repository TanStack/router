import { rootRoute } from './routes/__root'
import { doneRoute } from './routes/history.done'
import { formRoute } from './routes/history.form.$formId'
import { reviewRoute } from './routes/history.review.$reviewId'
import { historyRoute } from './routes/history'

export const routeTree = rootRoute.addChildren([
  historyRoute.addChildren([formRoute, reviewRoute, doneRoute]),
])
