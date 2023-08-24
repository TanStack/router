import { route as rootRoute } from "./routes/__root"
import { route as PostsRoute } from "./routes/posts"
import { route as LayoutRoute } from "./routes/_layout"
import { route as IndexRoute } from "./routes/index"
import { route as PostsPostIdRoute } from "./routes/posts.$postId"
import { route as LayoutLayoutBRoute } from "./routes/_layout/layout-b"
import { route as LayoutLayoutARoute } from "./routes/_layout/layout-a"
import { route as PostsIndexRoute } from "./routes/posts.index"
import { route as PostsPostIdDeepRoute } from "./routes/posts_.$postId.deep"

declare module "@tanstack/react-router" {
  interface FileRoutesByPath {
    "/": {
      parentRoute: typeof rootRoute
    }
    "/_layout": {
      parentRoute: typeof rootRoute
    }
    "/posts": {
      parentRoute: typeof rootRoute
    }
    "/posts/": {
      parentRoute: typeof PostsRoute
    }
    "/_layout/layout-a": {
      parentRoute: typeof LayoutRoute
    }
    "/_layout/layout-b": {
      parentRoute: typeof LayoutRoute
    }
    "/posts/$postId": {
      parentRoute: typeof PostsRoute
    }
    "/posts_/$postId/deep": {
      parentRoute: typeof rootRoute
    }
  }
}

Object.assign(IndexRoute.options, {
  path: "/",
  getParentRoute: () => rootRoute,
})

Object.assign(LayoutRoute.options, {
  id: "/layout",
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

Object.assign(LayoutLayoutARoute.options, {
  path: "/layout-a",
  getParentRoute: () => LayoutRoute,
})

Object.assign(LayoutLayoutBRoute.options, {
  path: "/layout-b",
  getParentRoute: () => LayoutRoute,
})

Object.assign(PostsPostIdRoute.options, {
  path: "/$postId",
  getParentRoute: () => PostsRoute,
})

Object.assign(PostsPostIdDeepRoute.options, {
  path: "/posts/$postId/deep",
  getParentRoute: () => rootRoute,
})

export const routeTree = rootRoute.addChildren([
  IndexRoute,
  LayoutRoute.addChildren([LayoutLayoutARoute, LayoutLayoutBRoute]),
  PostsRoute.addChildren([PostsIndexRoute, PostsPostIdRoute]),
  PostsPostIdDeepRoute,
])
