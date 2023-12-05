import { Route as rootRoute } from "./routes/__root"
import { Route as PostsRoute } from "./routes/posts"
import { Route as IndexRoute } from "./routes/index"
import { Route as PostsPostIdRoute } from "./routes/posts/$postId"
import { Route as PostsIndexRoute } from "./routes/posts/index"

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      parentRoute: typeof rootRoute
    }
    "/posts": {
      parentRoute: typeof rootRoute
    }
    "/posts/": {
      parentRoute: typeof PostsRoute
    }
    "/posts/$postId": {
      parentRoute: typeof PostsRoute
    }
  }
}

Object.assign(IndexRoute.options, {
  path: "/",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsRoute.options, {
  path: "/posts",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsIndexRoute.options, {
  path: "/",
  getParentRoute: () => PostsRoute,
})

Object.assign(PostsPostIdRoute.options, {
  path: "/$postId",
  getParentRoute: () => PostsRoute,
})

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  PostsRoute.addChildren([PostsIndexRoute, PostsPostIdRoute]),
])
