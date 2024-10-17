---
id: server-middleware
title: Server Middleware
---

## What is Server Middleware?

Server Middleware allows server functions created with `createServerFn` to share logic, context, common operations, prerequisites, and much more, simply by referencing a middleware. Middleware can even depend on other middleware to create a chain of operations that are executed hierarchically and in order.

## What kinds of things can I do with Server Middleware?

- **Authentication**: Verify a user's identity before executing a server function.
- **Authorization**: Check if a user has the necessary permissions to execute a server function.
- **Logging**: Log requests, responses, and errors.
- **Observability**: Collect metrics, traces, and logs.
- **Provide Context**: Attach data to the request object for use in other middleware or server functions.
- **Error Handling**: Handle errors in a consistent way.
- And many more! The possibilities are up to you!

## Defining Server Middleware

Server Middleware is defined using the `createServerMiddleware` function. This function returns a `ServerMiddleware` object that can be used to continue customizing the middleware with methods like `middleware`, `input`, `use`, and `clientUse`.

```tsx
import { createServerMiddleware } from '@tanstack/start'

const loggingMiddleware = createServerMiddleware().use(
  async ({ next, input }) => {
    console.log('Request received:', input)
    const result = await next()
    console.log('Response processed:', result)
    return result
  },
)
```

## The `use` Method

The `use` method is used to define **server-side** logic that the middleware will execute both before and after any nested middleware and ultimately a server function. This method receives an object with the following properties:

- `next`: A function that, when called, will execute the next middleware in the chain.
- `input`: The input object that was passed to the server function.
- `context`: An object that stores data from parent middleware. It can be extended with additional data that will be passed to child middleware.

## Using the `next` function

When using the `use` method, the `next` function is used to execute the next middleware in the chain.

**You must call it and return its result!**.

```tsx
const loggingMiddleware = create
```

It can be optionally called with an object that has a `context` property with an object value. Whatever properties you pass to this `context` value will be merged into the parent `context` and provided to the next middleware.

```tsx
const loggingMiddleware = createServerMiddleware().use(({ next }) => {
  return next({
    context: {
      isAwesome: true,
    },
  })
})
```
