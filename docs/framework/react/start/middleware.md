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

Middleware is defined using the `createMiddleware` function. This function returns a `Middleware` object that can be used to continue customizing the middleware with methods like `middleware`, `input`, `server`, and `clientUse`.

```tsx
import { createMiddleware } from '@tanstack/start'

const loggingMiddleware = createMiddleware().server(async ({ next, input }) => {
  console.log('Request received:', input)
  const result = await next()
  console.log('Response processed:', result)
  return result
})
```

## Middleware Methods

Several methods are available to customize the middleware. If you are (hopefully) using TypeScript, the order of these methods is enforced by the type system to ensure maximum inference and type safety.

- `middleware`: Add a middleware to the chain.
- `input`: Modify the input object before it is passed to this middleware and any nested middleware.
- `server`: Define server-side logic that the middleware will execute before any nested middleware and ultimately a server function, and also provide the result to the next middleware.
- `clientUse`: Define client-side logic that the middleware will execute before any nested middleware and ultimately the client-side RPC function (or the server-side function), and also provide the result to the next middleware.

## The `middleware` method

The `middleware` method is used to dependency middleware to the chain that will executed **before** the current middleware. Just call the `middleware` method with an array of middleware objects.

```tsx
const loggingMiddleware = createMiddleware().middleware([
  authMiddleware,
  loggingMiddleware,
])
```

Type-safe context and input validation are also inherited from parent middlewares!

## The `input` method

The `input` method is used to modify the input object before it is passed to this middleware, nested middleware, and ultimately the server function. This method should receive a function that takes the input object and returns a validated (and optionally modified) input object. It's common to use a validation library like `zod` to do this. Here is an example:

```tsx
import { z } from 'zod'

const inputSchema = z.object({
  workspaceId: z.string(),
})

const workspaceMiddleware = createMiddleware()
  .input(zodValidator(inputSchema))
  .server(({ next, input }) => {
    console.log('Workspace ID:', input.workspaceId)
    return next()
  })
```

## The `server` method

The `server` method is used to define **server-side** logic that the middleware will execute both before and after any nested middleware and ultimately a server function. This method receives an object with the following properties:

- `next`: A function that, when called, will execute the next middleware in the chain.
- `input`: The input object that was passed to the server function.
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

## Client-side Input Validation

By default, middleware validation is only performed on the server to keep the client bundle size small. However, you may also choose to validate input on the client side by passing the `validateClient: true` option to the `createMiddleware` function. This will cause the input to be validated on the client side before being sent to the server, potentially saving a round trip.

> Why can't I pass a different validation schema for the client?
>
> The client-side validation schema is derived from the server-side schema. This is because the client-side validation schema is used to validate the input before it is sent to the server. If the client-side schema were different from the server-side schema, the server would receive input that it did not expect, which could lead to unexpected behavior.

```tsx
const workspaceMiddleware = createMiddleware({ validateClient: true })
  .input(zodValidator(inputSchema))
  .server(({ next, input }) => {
    console.log('Workspace ID:', input.workspaceId)
    return next()
  })
```

## The `clientUse` method

Client middleware logic is defined using the `clientUse` method on a `Middleware` object. This method is used to define client-side logic that the middleware will execute both before and after any nested middleware and ultimately the client-side RPC function (or the server-side function if you're doing SSR or calling this function from another server function).

**Client-side middleware logic shares much of the same API as logic created with the `server` method, but it is executed on the client side.** This includes:

- Requiring the `next` function to be called to continue the chain.
- The ability to provide context to the next client middleware via the `next` function.
- The ability to modify the input object before it is passed to the next client middleware.

Similar to the `server` function, it also receives an object with the following properties:

- `next`: A function that, when called, will execute the next client middleware in the chain.
- `input`: The input object that was passed to the client function.
- `context`: An object that stores data from parent middleware. It can be extended with additional data that will be passed to child middleware.

```tsx
const loggingMiddleware = createMiddleware().clientUse(async ({ next }) => {
  console.log('Request sent')
  const result = await next()
  console.log('Response received')
  return result
})
```

## Sending client context to the server

**Client context is NOT sent to the server by default since this could end up unintentionally sending large payloads to the server.** If you need to send client context to the server, you must use the `sendClientContext` function to transmit any data to the server. Anything returned from `sendClientContext` will be serialized and sent to the server along with the input.

```tsx
const requestLogger = createMiddleware()
  .clientUse(async ({ next, context }) => {
    return next({
      context: {
        workspaceId: context.workspaceId,
      },
    })
  })
  .sendClientContext(({ context: { workspaceId } }) => ({ workspaceId }))
  .server(async ({ next, input, context }) => {
    console.log('Workspace ID:', context.workspaceId)
    return next()
  })
```

## Client-Sent Context Security

You may have noticed that in the example above, client-sent context is not validated by the server-side input schema. This is primarily because it's highly unlikely that client-side context includes dynamic user-generated data that could be harmful. However, **if you are sending dynamic data from the client to the server via context, you should validate it in the server-side middleware before using it.** Here's an example:

```tsx
const requestLogger = createMiddleware()
  .clientUse(async ({ next, context }) => {
    return next({
      context: {
        workspaceId: context.workspaceId,
      },
    })
  })
  .sendClientContext(({ context: { workspaceId } }) => ({ workspaceId }))
  .server(async ({ next, input, context }) => {
    // Validate the workspace ID before using it
    const workspaceId = zodValidator(z.number()).parse(context.workspaceId)
    console.log('Workspace ID:', workspaceId)
    return next()
  })
```
