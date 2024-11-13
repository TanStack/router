---
id: middleware
title: Middleware
---

## What is Middleware?

Middleware allows you to customized the behavior of server functions created with `createServerFn` with things like shared validation, context, and much more. Middleware can even depend on other middleware to create a chain of operations that are executed hierarchically and in order.

## What kinds of things can I do with Middleware?

- **Authentication**: Verify a user's identity before executing a server function.
- **Authorization**: Check if a user has the necessary permissions to execute a server function.
- **Logging**: Log requests, responses, and errors.
- **Observability**: Collect metrics, traces, and logs.
- **Provide Context**: Attach data to the request object for use in other middleware or server functions.
- **Error Handling**: Handle errors in a consistent way.
- And many more! The possibilities are up to you!

## Defining Middleware

Middleware is defined using the `createMiddleware` function. This function returns a `Middleware` object that can be used to continue customizing the middleware with methods like `middleware`, `validator`, `server`, and `client`.

```tsx
import { createMiddleware } from '@tanstack/start'

const loggingMiddleware = createMiddleware().server(async ({ next, data }) => {
  console.log('Request received:', data)
  const result = await next()
  console.log('Response processed:', result)
  return result
})
```

## Middleware Methods

Several methods are available to customize the middleware. If you are (hopefully) using TypeScript, the order of these methods is enforced by the type system to ensure maximum inference and type safety.

- `middleware`: Add a middleware to the chain.
- `validator`: Modify the data object before it is passed to this middleware and any nested middleware.
- `server`: Define server-side logic that the middleware will execute before any nested middleware and ultimately a server function, and also provide the result to the next middleware.
- `client`: Define client-side logic that the middleware will execute before any nested middleware and ultimately the client-side RPC function (or the server-side function), and also provide the result to the next middleware.

## The `middleware` method

The `middleware` method is used to dependency middleware to the chain that will executed **before** the current middleware. Just call the `middleware` method with an array of middleware objects.

```tsx
const loggingMiddleware = createMiddleware().middleware([
  authMiddleware,
  loggingMiddleware,
])
```

Type-safe context and payload validation are also inherited from parent middlewares!

## The `validator` method

The `validator` method is used to modify the data object before it is passed to this middleware, nested middleware, and ultimately the server function. This method should receive a function that takes the data object and returns a validated (and optionally modified) data object. It's common to use a validation library like `zod` to do this. Here is an example:

```tsx
import { z } from 'zod'

const mySchema = z.object({
  workspaceId: z.string(),
})

const workspaceMiddleware = createMiddleware()
  .validator(zodValidator(mySchema))
  .server(({ next, data }) => {
    console.log('Workspace ID:', data.workspaceId)
    return next()
  })
```

## The `server` method

The `server` method is used to define **server-side** logic that the middleware will execute both before and after any nested middleware and ultimately a server function. This method receives an object with the following properties:

- `next`: A function that, when called, will execute the next middleware in the chain.
- `data`: The data object that was passed to the server function.
- `context`: An object that stores data from parent middleware. It can be extended with additional data that will be passed to child middleware.

## Returning the required result from `next`

The `next` function is used to execute the next middleware in the chain. **You must await and return (or return directly) the result of the `next` function provided to you** for the chain to continue executing.

```tsx
const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('Request received')
  const result = await next()
  console.log('Response processed')
  return result
})
```

## Providing context to the next middleware via `next`

The `next` function can be optionally called with an object that has a `context` property with an object value. Whatever properties you pass to this `context` value will be merged into the parent `context` and provided to the next middleware.

```tsx
const awesomeMiddleware = createMiddleware().server(({ next }) => {
  return next({
    context: {
      isAwesome: Math.random() > 0.5,
    },
  })
})

const loggingMiddleware = createMiddleware().server(
  async ({ next, context }) => {
    console.log('Is awesome?', context.isAwesome)
    return next()
  },
)
```

## Client-Side Logic

Despite server functions being mostly server-side bound operations, there is still plenty of client-side logic surrounding the outgoing RPC request from the client. This means that we can also define client-side logic in middleware that will execute on the client side around any nested middleware and ultimately the RPC function and its response to the client.

## Client-side Payload Validation

By default, middleware validation is only performed on the server to keep the client bundle size small. However, you may also choose to validate data on the client side by passing the `validateClient: true` option to the `createMiddleware` function. This will cause the data to be validated on the client side before being sent to the server, potentially saving a round trip.

> Why can't I pass a different validation schema for the client?
>
> The client-side validation schema is derived from the server-side schema. This is because the client-side validation schema is used to validate the data before it is sent to the server. If the client-side schema were different from the server-side schema, the server would receive data that it did not expect, which could lead to unexpected behavior.

```tsx
const workspaceMiddleware = createMiddleware({ validateClient: true })
  .validator(zodValidator(mySchema))
  .server(({ next, data }) => {
    console.log('Workspace ID:', data.workspaceId)
    return next()
  })
```

## The `client` method

Client middleware logic is defined using the `client` method on a `Middleware` object. This method is used to define client-side logic that the middleware will execute both before and after any nested middleware and ultimately the client-side RPC function (or the server-side function if you're doing SSR or calling this function from another server function).

**Client-side middleware logic shares much of the same API as logic created with the `server` method, but it is executed on the client side.** This includes:

- Requiring the `next` function to be called to continue the chain.
- The ability to provide context to the next client middleware via the `next` function.
- The ability to modify the data object before it is passed to the next client middleware.

Similar to the `server` function, it also receives an object with the following properties:

- `next`: A function that, when called, will execute the next client middleware in the chain.
- `data`: The data object that was passed to the client function.
- `context`: An object that stores data from parent middleware. It can be extended with additional data that will be passed to child middleware.

```tsx
const loggingMiddleware = createMiddleware().client(async ({ next }) => {
  console.log('Request sent')
  const result = await next()
  console.log('Response received')
  return result
})
```

## Sending client context to the server

**Client context is NOT sent to the server by default since this could end up unintentionally sending large payloads to the server.** If you need to send client context to the server, you must call the `next` function with a `sendContext` property and object to transmit any data to the server. Any properties passed to `sendContext` will be merged, serialized and sent to the server along with the data and will be available on the normal context object of any nested server middleware.

```tsx
const requestLogger = createMiddleware()
  .client(async ({ next, context }) => {
    return next({
      sendContext: {
        // Send the workspace ID to the server
        workspaceId: context.workspaceId,
      },
    })
  })
  .server(async ({ next, data, context }) => {
    // Woah! We have the workspace ID from the client!
    console.log('Workspace ID:', context.workspaceId)
    return next()
  })
```

## Client-Sent Context Security

You may have noticed that in the example above that while client-sent context is type-safe, it is is not required to be validated at runtime. If you pass dynamic user-generated data via context, that could pose a security concern, so **if you are sending dynamic data from the client to the server via context, you should validate it in the server-side middleware before using it.** Here's an example:

```tsx
const requestLogger = createMiddleware()
  .client(async ({ next, context }) => {
    return next({
      sendContext: {
        workspaceId: context.workspaceId,
      },
    })
  })
  .server(async ({ next, data, context }) => {
    // Validate the workspace ID before using it
    const workspaceId = zodValidator(z.number()).parse(context.workspaceId)
    console.log('Workspace ID:', workspaceId)
    return next()
  })
```

## Sending server context to the client

Similar to sending client context to the server, you can also send server context to the client by calling the `next` function with a `sendContext` property and object to transmit any data to the client. Any properties passed to `sendContext` will be merged, serialized and sent to the client along with the response and will be available on the normal context object of any nested client middleware.

```tsx
const requestLogger = createMiddleware()
  .client(async ({ next, context }) => {
    const result = next()
    // Woah! We have the time from the server!
    console.log('Time from the server:', result.context.timeFromServer)
  })
  .server(async ({ next }) => {
    return next({
      sendContext: {
        // Send the current time to the client
        timeFromServer: new Date(),
      },
    })
  })
```

## Reading/Modifying the Server Response

Middleware that uses the `server` method executes in the same context as server functions, so you can follow the exact same [Server Function Context Utilities](./server-functions#server-function-context) to read and modify anything about the request headers, status codes, etc.

## Modifying the Client Request

Middleware that uses the `client` method executes in a **completely different client-side context** than server functions, so you can't use the same utilities to read and modify the request. However, you can still modify the request returning additional properties when calling the `next` function. Currently supported properties are:

- `headers`: An object containing headers to be added to the request.

Here's an example of adding an `Authorization` header any request using this middleware:

```tsx
import { getToken } from 'my-auth-library'

const authMiddleware = createMiddleware().client(async ({ next }) => {
  return next({
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
})
```

## Middleware Execution Order

Middleware is executed dependency-first, so the following example will execute `a`, `b`, `c` and `d` in that order:

```tsx
const a = createMiddleware().server(async ({ next }) => {
  console.log('a')
  return next()
})

const b = createMiddleware()
  .middleware([a])
  .server(async ({ next }) => {
    console.log('b')
    return next()
  })

const c = createMiddleware()
  .middleware()
  .server(async ({ next }) => {
    console.log('c')
    return next()
  })

const d = createMiddleware()
  .middleware([b, c])
  .server(async () => {
    console.log('d')
  })

const fn = createServerFn()
  .middleware([d])
  .server(async () => {
    console.log('fn')
  })
```

## Environment Tree Shaking

Middleware functionality is tree-shaken based on the environment for each bundle produced.

- On the server, nothing is tree-shaken, so all code used in middleware will be included in the server bundle.
- On the client, all server-specific code is removed from the client bundle. This means any code used in the `server` method is always removed from the client bundle. If `validateClient` is set to `true`, the client-side validation code will be included in the client bundle, otherwise `data` validation code will also be removed.
