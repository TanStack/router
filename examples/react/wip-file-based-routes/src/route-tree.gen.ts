import { route as rootRoute } from "./routes/__root"
import { route as PostsIndexRoute } from "./routes/posts"
import { route as IndexRoute } from "./routes"
import { route as PostsPostIdIndexRoute } from "./routes/posts/$postId"
import { route as PostsLayoutRoute } from "./routes/posts/_layout"
import { route as PostsPostIdDeepIndexRoute } from "./routes/posts/$postId/deep"
import { route as PostsPostIdDeepLayoutRoute } from "./routes/posts/$postId/deep/_layout"

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      parentRoute: typeof rootRoute
    }
    "/posts": {
      parentRoute: typeof PostsLayoutRoute
    }
    "/posts/_layout": {
      parentRoute: typeof rootRoute
    }
    "/posts/$postId": {
      parentRoute: typeof PostsIndexRoute
    }
    "/posts/$postId/deep": {
      parentRoute: typeof PostsPostIdDeepLayoutRoute
    }
    "/posts/$postId/deep/_layout": {
      parentRoute: typeof PostsPostIdIndexRoute
    }
  }
}

Object.assign(IndexRoute.options, {
  path: "/",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsIndexRoute.options, {
  path: "/posts",
  getParentRoute: () => PostsLayoutRoute,
})

Object.assign(PostsLayoutRoute.options, {
  id: "/posts/layout",
  getParentRoute: () => rootRoute,
})

Object.assign(PostsPostIdIndexRoute.options, {
  path: "/$postId",
  getParentRoute: () => PostsIndexRoute,
})

Object.assign(PostsPostIdDeepIndexRoute.options, {
  path: "/deep",
  getParentRoute: () => PostsPostIdDeepLayoutRoute,
})

Object.assign(PostsPostIdDeepLayoutRoute.options, {
  id: "/deep/layout",
  getParentRoute: () => PostsPostIdIndexRoute,
})

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  PostsLayoutRoute.addChildren([
    PostsIndexRoute.addChildren([
      PostsPostIdIndexRoute.addChildren([
        PostsPostIdDeepLayoutRoute.addChildren([PostsPostIdDeepIndexRoute]),
      ]),
    ]),
  ]),
])
