import { Route as RootRoute } from './routes/__root'
import { Route as IndexRoute } from './routes/index'
import { Route as UsersRoute } from './routes/users'
import { Route as UserDetailRoute } from './routes/users.$id'
import { Route as PostsRoute } from './routes/posts'
import { Route as PostDetailRoute } from './routes/posts.$slug'

UsersRoute.addChildren([UserDetailRoute])
PostsRoute.addChildren([PostDetailRoute])
RootRoute.addChildren([IndexRoute, UsersRoute, PostsRoute])

export const routeTree = RootRoute
