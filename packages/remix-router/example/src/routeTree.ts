import { Route as RootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as UsersRoute } from './routes/users'
import { Route as UserDetailRoute } from './routes/users.$id'

UsersRoute.addChildren([UserDetailRoute])
RootRoute.addChildren([IndexRoute, UsersRoute])

export const routeTree = RootRoute
