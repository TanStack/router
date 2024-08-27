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

This file is responsible for creating the API handler that will be used to route incoming requests to the appropriate API route handler. The `defaultAPIFileRouteHandler` is a helper function that will automatically load and execute the appropriate API route handler based on the incoming request.

## Defining an API Route

API routes export an APIRoute instance by calling the `createAPIFileRoute` function. Similar to other file-based routes in TanStack Router, the first argument to this function is the path of the route. The function returned is called again with an object that defines the route handlers for each HTTP method.

> [!TIP]
> If you've already got the dev server running, when you create a new API route, it'll automatically have the initial handler set up for you. From there on, you can customize the handler as needed.

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/hello')({
  GET: async ({ request }) => {
    return new Response('Hello, World! from ' + request.url)
  },
})
```

Each HTTP method handler receives an object with the following properties:

- `request`: The incoming request object. You can read more about the `Request` object in the [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Request).
- `params`: An object containing the dynamic path parameters of the route. For example, if the route path is `/users/$id`, and the request is made to `/users/123`, then `params` will be `{ id: '123' }`. We'll cover dynamic path parameters and wildcard parameters later in this guide.

Once you've processed the request, you need to return a `Response` object or `Promise<Response>`. This can be done by creating a new `Response` object and returning it from the handler. You can read more about the `Response` object in the [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Response).

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

// Visit /api/users/123 to see the response
// User ID: 123
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

// Visit /api/file/hello.txt to see the response
// File: hello.txt
```

## Setting headers in the response

Sometimes you may need to set headers in the response. You can do this by passing an object as the second argument to the `Response` constructor.

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/hello')({
  GET: async ({ request }) => {
    return new Response('Hello, World!', {
      headers: {
        'Content-Type': 'text/plain',
      },
    })
  },
})

// Visit /api/hello to see the response
// Hello, World!
```

## Responding with JSON

When returning JSON using a Response object, this is a common pattern:

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/hello')({
  GET: async ({ request }) => {
    return new Response(JSON.stringify({ message: 'Hello, World!' }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
})

// Visit /api/hello to see the response
// {"message":"Hello, World!"}
```

Or you can use the `json` helper function to automatically set the `Content-Type` header to `application/json`.

```ts
// routes/api/hello.ts
import { json } from '@tanstack/start'
import { createAPIFileRoute } from '@tanstack/start/api'

export const Route = createAPIFileRoute('/hello')({
  GET: async ({ request }) => {
    return json({ message: 'Hello, World!' })
  },
})

// Visit /api/hello to see the response
// {"message":"Hello, World!"}
```
