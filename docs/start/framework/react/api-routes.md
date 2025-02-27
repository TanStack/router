---
id: api-routes
title: API Routes
---

API Routes are a powerful feature of TanStack Start that allow you to create server-side endpoints in your application without the need for a separate server. API Routes are useful for handling form submissions, user authentication, and more.

By default, API Routes are defined in your `./app/routes/api` directory of your project and are automatically handled by the TanStack Start server.

> 🧠 This means that by default, your API Routes will be prefixed with `/api` and will be served from the same server as your application. You can customize this base path by changing the `server.apiBaseURL` in your TanStack Start config.

## File Route Conventions

API Routes in TanStack Start, follow the same file-based routing conventions as TanStack Router. This means that each file in your `routes` directory that is prefixed with `api` (which can be configured) will be treated as an API route. Here are a few examples:

- `routes/api.users.ts` will create an API route at `/api/users`
- `routes/api/users.ts` will **also** create an API route at `/api/users`
- `routes/api/users.index.ts` will **also** create an API route at `/api/users`
- `routes/api/users/$id.ts` will create an API route at `/api/users/$id`
- `routes/api/users/$id/posts.ts` will create an API route at `/api/users/$id/posts`
- `routes/api.users.$id.posts.ts` will **also** create an API route at `/api/users/$id/posts`
- `routes/api/file/$.ts` will create an API route at `/api/file/$`

Your route files that are prefixed with `api`, can be thought of as the handlers for the given API route path.

It's important to remember that each route can only have a single handler file associated with it. So, if you have a file named `routes/api/users.ts` which'd equal the request path of `/api/users`, you cannot have other files that'd also resolve to the same route, like:

- `routes/api/users.index.ts`
- `routes/api.users.ts`.
- `routes/api.users.index.ts`.

❗ One more thing, API Routes do not have the concept of pathless layout routes or parallel routes. So, a file named:

- `routes/api/_pathlessLayout/users.ts` would resolve to `/api/_pathlessLayout/users` and **NOT** `/api/users`.

## Nested Directories vs File-names

In the examples above, you may have noticed that the file naming conventions are flexible and allow you to mix and match directories and file names. This is intentional and allows you to organize your API Routes in a way that makes sense for your application. You can read more about this in the [TanStack Router File-based Routing Guide](/router/latest/docs/framework/react/routing/file-based-routing#s-or-s).

## Setting up the entry handler

Before you can create your API routes, you need to set up the entry handler for your TanStack Start project. This entry handler, similar to `client` and `ssr`, handles the API incoming requests and routes them to the appropriate API route handler. The API entry handler is defined in the `app/api.ts` file in your project.

Here's an example implementation:

```ts
// app/api.ts
import {
  createStartAPIHandler,
  defaultAPIFileRouteHandler,
} from '@tanstack/react-start/api'

export default createStartAPIHandler(defaultAPIFileRouteHandler)
```

This file is responsible for creating the API handler that will be used to route incoming requests to the appropriate API route handler. The `defaultAPIFileRouteHandler` is a helper function that will automatically load and execute the appropriate API route handler based on the incoming request.

## Defining an API Route

API Routes export an APIRoute instance by calling the `createAPIFileRoute` function. Similar to other file-based routes in TanStack Router, the first argument to this function is the path of the route. The function returned is called again with an object that defines the route handlers for each HTTP method.

> [!TIP]
> If you've already got the dev server running, when you create a new API route, it'll automatically have the initial handler set up for you. From there on, you can customize the handler as needed.

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/hello')({
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

API Routes support dynamic path parameters, which are denoted by a `$` followed by the parameter name. For example, a file named `routes/api/users/$id.ts` will create an API route at `/api/users/$id` that accepts a dynamic `id` parameter.

```ts
// routes/api/users/$id.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/users/$id')({
  GET: async ({ params }) => {
    const { id } = params
    return new Response(`User ID: ${id}`)
  },
})

// Visit /api/users/123 to see the response
// User ID: 123
```

You can also have multiple dynamic path parameters in a single route. For example, a file named `routes/api/users/$id/posts/$postId.ts` will create an API route at `/api/users/$id/posts/$postId` that accepts two dynamic parameters.

```ts
// routes/api/users/$id/posts/$postId.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/users/$id/posts/$postId')({
  GET: async ({ params }) => {
    const { id, postId } = params
    return new Response(`User ID: ${id}, Post ID: ${postId}`)
  },
})

// Visit /api/users/123/posts/456 to see the response
// User ID: 123, Post ID: 456
```

## Wildcard/Splat Param

API Routes also support wildcard parameters at the end of the path, which are denoted by a `$` followed by nothing. For example, a file named `routes/api/file/$.ts` will create an API route at `/api/file/$` that accepts a wildcard parameter.

```ts
// routes/api/file/$.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/file/$')({
  GET: async ({ params }) => {
    const { _splat } = params
    return new Response(`File: ${_splat}`)
  },
})

// Visit /api/file/hello.txt to see the response
// File: hello.txt
```

## Handling requests with a body

To handle POST requests,you can add a `POST` handler to the route object. The handler will receive the request object as the first argument, and you can access the request body using the `request.json()` method.

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/hello')({
  POST: async ({ request }) => {
    const body = await request.json()
    return new Response(`Hello, ${body.name}!`)
  },
})

// Send a POST request to /api/hello with a JSON body like { "name": "Tanner" }
// Hello, Tanner!
```

This also applies to other HTTP methods like `PUT`, `PATCH`, and `DELETE`. You can add handlers for these methods in the route object and access the request body using the appropriate method.

It's important to remember that the `request.json()` method returns a `Promise` that resolves to the parsed JSON body of the request. You need to `await` the result to access the body.

This is a common pattern for handling POST requests in API Routes. You can also use other methods like `request.text()` or `request.formData()` to access the body of the request.

## Responding with JSON

When returning JSON using a Response object, this is a common pattern:

```ts
// routes/api/hello.ts
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/hello')({
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

## Using the `json` helper function

Or you can use the `json` helper function to automatically set the `Content-Type` header to `application/json` and serialize the JSON object for you.

```ts
// routes/api/hello.ts
import { json } from '@tanstack/react-start'
import { createAPIFileRoute } from '@tanstack/react-start/api'

export const APIRoute = createAPIFileRoute('/api/hello')({
  GET: async ({ request }) => {
    return json({ message: 'Hello, World!' })
  },
})

// Visit /api/hello to see the response
// {"message":"Hello, World!"}
```

## Responding with a status code

You can set the status code of the response by either:

- Passing it as a property of the second argument to the `Response` constructor

  ```ts
  // routes/api/hello.ts
  import { json } from '@tanstack/react-start'
  import { createAPIFileRoute } from '@tanstack/react-start/api'

  export const APIRoute = createAPIFileRoute('/users/$id')({
    GET: async ({ request, params }) => {
      const user = await findUser(params.id)
      if (!user) {
        return new Response('User not found', {
          status: 404,
        })
      }
      return json(user)
    },
  })
  ```

- Using the `setResponseStatus` helper function from `@tanstack/react-start/server`

  ```ts
  // routes/api/hello.ts
  import { json } from '@tanstack/react-start'
  import { createAPIFileRoute } from '@tanstack/react-start/api'
  import { setResponseStatus } from '@tanstack/react-start/server'

  export const APIRoute = createAPIFileRoute('/users/$id')({
    GET: async ({ request, params }) => {
      const user = await findUser(params.id)
      if (!user) {
        setResponseStatus(404)
        return new Response('User not found')
      }
      return json(user)
    },
  })
  ```

In this example, we're returning a `404` status code if the user is not found. You can set any valid HTTP status code using this method.

## Setting headers in the response

Sometimes you may need to set headers in the response. You can do this by either:

- Passing an object as the second argument to the `Response` constructor.

  ```ts
  // routes/api/hello.ts
  import { createAPIFileRoute } from '@tanstack/react-start/api'

  export const APIRoute = createAPIFileRoute('/api/hello')({
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

- Or using the `setHeaders` helper function from `@tanstack/react-start/server`.

  ```ts
  // routes/api/hello.ts
  import { createAPIFileRoute } from '@tanstack/react-start/api'
  import { setHeaders } from '@tanstack/react-start/server'

  export const APIRoute = createAPIFileRoute('/api/hello')({
    GET: async ({ request }) => {
      setHeaders({
        'Content-Type': 'text/plain',
      })
      return new Response('Hello, World!')
    },
  })
  ```
