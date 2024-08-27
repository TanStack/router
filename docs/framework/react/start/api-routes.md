---
id: api-routes
title: API Routes
---

API routes are a powerful feature of TanStack Start that allow you to create server-side endpoints in your application without the need for a separate server. API routes are useful for handling form submissions, user authentication, and more.

By default, API routes are defined in your `./app/routes/api` directory of your project and are automatically handled by the TanStack Start server.

> 🧠 This means that by default, your API routes will be prefixed with `/api` and will be served from the same server as your application. You can customize this base path by changing the `apiBase` in your TanStack Start config.

## File Route Conventions

API routes in TanStack Start, follow the same file-based routing conventions as TanStack Router. This means that each file in your `routes` directory that is prefixed with `api` (which can be configured) will be treated as an API route. Here are a few examples:

- `routes/api.users.ts` will create an API route at `/api/users`
- `routes/api/users.ts` will **also** create an API route at `/api/users`
- `routes/api/users.index.ts` will **also** create an API route at `/api/users`
- `routes/api/users/$id.ts` will create an API route at `/api/users/$id`
- `routes/api/users/$id/posts.ts` will create an API route at `/api/users/$id/posts`
- `routes/api.users.$id.posts.ts` will **also** create an API route at `/api/users/$id/posts`
- `routes/api/file/$.ts` will create an API route at `/api/file/$`

Your route files that are prefixed with `api`, can be thought of as the handlers for the given API route path. It's important to remember that each route can only have a single handler file associated with it.

So, if you have a file named `routes/api/users.ts` which'd equal the request path of `/api/users`, you cannot have other files that'd also resolve to the same route, like:

- `routes/api/users.index.ts`
- `routes/api.users.ts`.
- `routes/api.users.index.ts`.

❗ One more thing, API routes do not have the concept of pathless/layout routes or parallel routes. So, a file named:

- `routes/api/_layout/users.ts` would resolve to `/api/_layout/users` and NOT `/api/users`.

## Directories vs File-names

In the examples above, you may have noticed that the file naming conventions are flexible and allow you to mix and match directories and file names. This is intentional and allows you to organize your API routes in a way that makes sense for your application.

So you can choose to organize your API routes in a flat structure 🫓:

```bash
routes/
  api.users.ts
  api.posts.ts
  api.comments.ts
```

Or you can choose to organize your API routes in a nested structure ⛰️:

```bash
routes/
  api/
    users.ts
    posts.ts
    comments.ts
```

Or even a combination of both 🤯:

```bash
routes/
  api.users.ts
  api/
    posts.ts
    comments.ts
```

## Setting up the entry handler

Your TanStack Start project needs an entry handler to handle the API incoming requests and route them to the appropriate API route handler. This is done by creating an `app/api.ts` file in your project:

```ts
// app/api.ts
import {
  createStartAPIHandler,
  defaultAPIFileRouteHandler,
} from '@tanstack/start/api'

export default createStartAPIHandler(defaultAPIFileRouteHandler)
```

## Defining an API Route

API routes export an APIRoute instance by calling the `createAPIFileRoute` function. Similar to other file-based routes in TanStack Router, the first argument to this function is the path of the route. The function returned is called again with an object that defines the route handlers for each HTTP method.

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/hello')({
  GET: async ({ request }) => {
    return new Response('Hello, World! from ' + request.url)
  },
})
```

## Dynamic Path Params

API routes support dynamic path parameters, which are denoted by a `$` followed by the parameter name. For example, a file named `routes/api/users/$id.ts` will create an API route at `/api/users/$id` that accepts a dynamic `id` parameter.

```ts
// routes/api/users/$id.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/users/$id')({
  GET: async ({ params }) => {
    const { id } = params
    return new Response(`User ID: ${id}`)
  },
})
```

## Wildcard/Splat Param

API routes also support wildcard parameters at the end of the path, which are denoted by a `$` followed by nothing. For example, a file named `routes/api/file/$.ts` will create an API route at `/api/file/$` that accepts a wildcard parameter.

```ts
// routes/api/file/$.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/file/$')({
  GET: async ({ params }) => {
    const { _splat } = params
    return new Response(`File: ${_splat}`)
  },
})
```
