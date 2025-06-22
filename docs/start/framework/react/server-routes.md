---
id: server-routes
title: Server Routes
---

// TODO: Add redirect from api-routes to server-routes

Server routes are a powerful feature of TanStack Start that allow you to create server-side endpoints in your application and are useful for handling raw HTTP requests, form submissions, user authentication, and much more.

Server routes can be defined in your `./src/routes` directory of your project **right alongside your TanStack Router routes** and are automatically handled by the TanStack Start server.

Here's what a simple server route looks like:

```ts
// routes/hello.ts

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response('Hello, World!')
  },
})
```

## Server Routes and App Routes

Because server routes can be defined in the same directory as your app routes, you can even use the same file for both!

```tsx
// routes/hello.tsx

export const ServerRoute = createServerFileRoute().methods({
  POST: async ({ request }) => {
    const body = await request.json()
    return new Response(JSON.stringify({ message: `Hello, ${body.name}!` }))
  },
})

export const Route = createFileRoute('/hello')({
  component: HelloComponent,
})

function HelloComponent() {
  const [reply, setReply] = useState('')

  return (
    <div>
      <button
        onClick={() => {
          fetch('/hello', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: 'Tanner' }),
          })
            .then((res) => res.json())
            .then((data) => setReply(data.message))
        }}
      >
        Say Hello
      </button>
    </div>
  )
}
```

## File Route Conventions

Server routes in TanStack Start, follow the same file-based routing conventions as TanStack Router. This means that each file in your `routes` directory with a `ServerRoute` export will be treated as an API route. Here are a few examples:

- `/routes/users.ts` will create an API route at `/users`
- `/routes/users.index.ts` will **also** create an API route at `/users` (but will error if duplicate methods are defined)
- `/routes/users/$id.ts` will create an API route at `/users/$id`
- `/routes/users/$id/posts.ts` will create an API route at `/users/$id/posts`
- `/routes/users.$id.posts.ts` will create an API route at `/users/$id/posts`
- `/routes/api/file/$.ts` will create an API route at `/api/file/$`
- `/routes/my-script[.]js.ts` will create an API route at `/my-script.js`

## Unique Route Paths

Each route can only have a single handler file associated with it. So, if you have a file named `routes/users.ts` which'd equal the request path of `/users`, you cannot have other files that'd also resolve to the same route. For example, the following files would all resolve to the same route and would error:

- `/routes/users.index.ts`
- `/routes/users.ts`
- `/routes/users/index.ts`

## Escaped Matching

Just as with normal routes, server routes can match on escaped characters. For example, a file named `routes/users[.]json.ts` will create an API route at `/users[.]json`.

## Pathless Layout Routes and Break-out Routes

Because of the unified routing system, pathless layout routes and break-out routes are supported for similar functionality around server route middleware.

- Pathless layout routes can be used to add middleware to a group of routes
- Break-out routes can be used to "break out" of parent middleware

## Nested Directories vs File-names

In the examples above, you may have noticed that the file naming conventions are flexible and allow you to mix and match directories and file names. This is intentional and allows you to organize your Server routes in a way that makes sense for your application. You can read more about this in the [TanStack Router File-based Routing Guide](/router/latest/docs/framework/react/routing/file-based-routing#s-or-s).

## Handling Server Route Requests

Server route requests are handled by Start's `createStartHandler` in your `server.ts` entry file.

```tsx
// server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createRouter } from './router'

export default createStartHandler({
  createRouter,
})(defaultStreamHandler)
```

The start handler is responsible for matching an incoming request to a server route and executing the appropriate middleware and handler.

Remember, if you need to customize the server handler, you can do so by creating a custom handler and then passing the event to the start handler:

```tsx
// server.ts
import { createStartHandler } from '@tanstack/react-start/server'

export default defineHandler((event) => {
  const startHandler = createStartHandler({
    createRouter,
  })(defaultStreamHandler)

  return startHandler(event)
})
```

## Defining a Server Route

Server routes are created by exporting a `ServerRoute` from a route file. The `ServerRoute` export should be created by calling the `createServerFileRoute` function. The resulting builder object can then be used to:

- Add route-level middleware
- Define handlers for each HTTP method

```ts
// routes/hello.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response('Hello, World! from ' + request.url)
  },
})
```

## Defining a Server Route Handler

There are two ways to define a handler for a server route.

- Provide a handler function directly to the method
- By calling the `handler` method on the method builder object for more advanced use cases

### Providing a handler function directly to the method

For simple use cases, you can provide a handler function directly to the method.

```ts
// routes/hello.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response('Hello, World! from ' + request.url)
  },
})
```

### Providing a handler function via the method builder object

For more complex use cases, you can provide a handler function via the method builder object. This allows you to add middleware to the method.

```tsx
// routes/hello.ts
export const ServerRoute = createServerFileRoute().methods((api) => ({
  GET: api.middleware([loggerMiddleware]).handler(async ({ request }) => {
    return new Response('Hello, World! from ' + request.url)
  }),
}))
```

## Handler Context

Each HTTP method handler receives an object with the following properties:

- `request`: The incoming request object. You can read more about the `Request` object in the [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Request).
- `params`: An object containing the dynamic path parameters of the route. For example, if the route path is `/users/$id`, and the request is made to `/users/123`, then `params` will be `{ id: '123' }`. We'll cover dynamic path parameters and wildcard parameters later in this guide.
- `context`: An object containing the context of the request. This is useful for passing data between middleware.

Once you've processed the request, you can return a `Response` object or `Promise<Response>` or even use any of the helpers from `@tanstack/react-start` to manipulate the response.

## Dynamic Path Params

Server routes support dynamic path parameters in the same way as TanStack Router. For example, a file named `routes/users/$id.ts` will create an API route at `/users/$id` that accepts a dynamic `id` parameter.

```ts
// routes/users/$id.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    const { id } = params
    return new Response(`User ID: ${id}`)
  },
})

// Visit /users/123 to see the response
// User ID: 123
```

You can also have multiple dynamic path parameters in a single route. For example, a file named `routes/users/$id/posts/$postId.ts` will create an API route at `/users/$id/posts/$postId` that accepts two dynamic parameters.

```ts
// routes/users/$id/posts/$postId.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    const { id, postId } = params
    return new Response(`User ID: ${id}, Post ID: ${postId}`)
  },
})

// Visit /users/123/posts/456 to see the response
// User ID: 123, Post ID: 456
```

## Wildcard/Splat Param

Server routes also support wildcard parameters at the end of the path, which are denoted by a `$` followed by nothing. For example, a file named `routes/file/$.ts` will create an API route at `/file/$` that accepts a wildcard parameter.

```ts
// routes/file/$.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ params }) => {
    const { _splat } = params
    return new Response(`File: ${_splat}`)
  },
})

// Visit /file/hello.txt to see the response
// File: hello.txt
```

## Handling requests with a body

To handle POST requests,you can add a `POST` handler to the route object. The handler will receive the request object as the first argument, and you can access the request body using the `request.json()` method.

```ts
// routes/hello.ts
export const ServerRoute = createServerFileRoute().methods({
  POST: async ({ request }) => {
    const body = await request.json()
    return new Response(`Hello, ${body.name}!`)
  },
})

// Send a POST request to /hello with a JSON body like { "name": "Tanner" }
// Hello, Tanner!
```

This also applies to other HTTP methods like `PUT`, `PATCH`, and `DELETE`. You can add handlers for these methods in the route object and access the request body using the appropriate method.

It's important to remember that the `request.json()` method returns a `Promise` that resolves to the parsed JSON body of the request. You need to `await` the result to access the body.

This is a common pattern for handling POST requests in Server routes/ You can also use other methods like `request.text()` or `request.formData()` to access the body of the request.

## Responding with JSON

When returning JSON using a Response object, this is a common pattern:

```ts
// routes/hello.ts
export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return new Response(JSON.stringify({ message: 'Hello, World!' }), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  },
})

// Visit /hello to see the response
// {"message":"Hello, World!"}
```

## Using the `json` helper function

Or you can use the `json` helper function to automatically set the `Content-Type` header to `application/json` and serialize the JSON object for you.

```ts
// routes/hello.ts
import { json } from '@tanstack/react-start'

export const ServerRoute = createServerFileRoute().methods({
  GET: async ({ request }) => {
    return json({ message: 'Hello, World!' })
  },
})

// Visit /hello to see the response
// {"message":"Hello, World!"}
```

## Responding with a status code

You can set the status code of the response by either:

- Passing it as a property of the second argument to the `Response` constructor

  ```ts
  // routes/hello.ts
  import { json } from '@tanstack/react-start'

  export const ServerRoute = createServerFileRoute().methods({
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
  // routes/hello.ts
  import { json } from '@tanstack/react-start'
  import { setResponseStatus } from '@tanstack/react-start/server'

  export const ServerRoute = createServerFileRoute().methods({
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
  // routes/hello.ts
  export const ServerRoute = createServerFileRoute().methods({
    GET: async ({ request }) => {
      return new Response('Hello, World!', {
        headers: {
          'Content-Type': 'text/plain',
        },
      })
    },
  })

  // Visit /hello to see the response
  // Hello, World!
  ```

- Or using the `setHeaders` helper function from `@tanstack/react-start/server`.

  ```ts
  // routes/hello.ts
  import { setHeaders } from '@tanstack/react-start/server'

  export const ServerRoute = createServerFileRoute().methods({
    GET: async ({ request }) => {
      setHeaders({
        'Content-Type': 'text/plain',
      })
      return new Response('Hello, World!')
    },
  })
  ```
