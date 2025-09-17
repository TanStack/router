---
id: middleware
title: Middleware
---

Middleware customizes server function behavior with shared logic like authentication, validation, and logging. It executes before and after your server functions in a composable chain.

## Middleware Types

There are two types of middleware:

**Server Middleware** (default) - Works everywhere middleware can be used, including server routes:

```tsx
const loggingMiddleware = createMiddleware().server(({ next }) => {
  console.log('Request received')
  const result = await next()
  console.log('Response processed')
  return result
})
```

**Function Middleware** - Adds input validation and client-side lifecycle for server functions:

```tsx
const validatingMiddleware = createMiddleware({ type: 'function' })
  .validator(zodValidator(schema))
  .client(({ next }) => {
    console.log('Client: sending request')
    return next()
  })
  .server(({ next, data }) => {
    console.log('Server: validated data:', data) // Type-safe!
    return next()
  })
```

### When to Use Each Type

- **Server Middleware** (default): Use for authentication, logging, context sharing, and any server-only logic. Works with both server functions and server routes.
- **Function Middleware**: Use when you need input validation or client-side request/response handling for server functions.

### Method Order

When using TypeScript, the order of middleware methods is enforced by the type system for maximum inference and type safety. The recommended order is: `middleware` → `validator` → `server` → `client`.

## Common Use Cases

- **Authentication**: Verify user identity
- **Authorization**: Check permissions
- **Logging**: Track requests and responses
- **Validation**: Validate input data
- **Context**: Share data between middleware
- **Error Handling**: Handle errors consistently

## Server Method

The `server` method defines logic that runs on the server before and after nested middleware. It receives `next`, `data`, and `context`:

```tsx
const authMiddleware = createMiddleware().server(async ({ next, context }) => {
  // Check authentication
  if (!context.user) {
    throw new Error('Unauthorized')
  }

  // Continue to next middleware/handler
  const result = await next()
  return result
})
```

**Always call `next()` and return its result** to continue the middleware chain.

### Modifying Server Response

Server middleware can modify the response using the same [Server Function Context Utilities](../server-functions.md#server-function-context) to read and modify request headers, status codes, etc:

```tsx
import { setHeader } from '@tanstack/react-start/server'

const headerMiddleware = createMiddleware().server(({ next }) => {
  // Modify response headers
  setHeader('X-Custom-Header', 'value')
  return next()
})
```

## Adding Validation

**Function middleware** can validate input data using the `validator` method:

```tsx
import { createMiddleware } from '@tanstack/react-start'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const schema = z.object({
  userId: z.string(),
})

const validateUserMiddleware = createMiddleware({ type: 'function' })
  .validator(zodValidator(schema))
  .server(({ next, data }) => {
    console.log('Valid user ID:', data.userId) // Type-safe!
    return next()
  })
```

> **Note**: Only function middleware supports validation. Server middleware cannot use the `validator` method.

## Passing Context

Middleware can share data through context. Pass context to the next middleware using the `context` property:

```tsx
const userMiddleware = createMiddleware().server(({ next }) => {
  return next({
    context: {
      user: { id: '123', name: 'John' },
    },
  })
})

const logUserMiddleware = createMiddleware()
  .middleware([userMiddleware])
  .server(async ({ next, context }) => {
    console.log('User:', context.user.name) // Type-safe access
    return next()
  })
```

## Client-Side Logic

**Function middleware** can run on the client side to handle outgoing requests and responses:

```tsx
const clientLoggingMiddleware = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    console.log('Sending request...')
    const result = await next()
    console.log('Received response:', result)
    return result
  },
)
```

### Adding Request Headers

Add headers to outgoing requests using the `headers` property:

```tsx
const authMiddleware = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    return next({
      headers: {
        Authorization: `Bearer ${getToken()}`,
      },
    })
  },
)
```

> **Note**: Only function middleware supports client-side logic. Server middleware cannot use the `client` method.

### Client-Server Context

**Function middleware** can send data between client and server using `sendContext`. Client context is not sent by default:

```tsx
const contextMiddleware = createMiddleware({ type: 'function' })
  .client(({ next }) => {
    return next({
      sendContext: { userId: '123' },
    })
  })
  .server(({ next, context }) => {
    console.log('User ID from client:', context.userId)
    return next({
      sendContext: { timestamp: Date.now() },
    })
  })
```

**Security note**: Always validate client-sent context on the server before use.

```tsx
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

// Validate client-sent context for security
const secureMiddleware = createMiddleware({ type: 'function' })
  .client(({ next }) => {
    return next({
      sendContext: { workspaceId: getUserWorkspace() },
    })
  })
  .server(({ next, context }) => {
    // Validate before using
    const workspaceId = zodValidator(z.string()).parse(context.workspaceId)
    return next({ context: { validatedWorkspaceId: workspaceId } })
  })
```

### Server-to-Client Context

Server middleware can also send context back to the client:

```tsx
const serverTimerMiddleware = createMiddleware({ type: 'function' })
  .server(({ next }) => {
    return next({
      sendContext: { serverTime: new Date().toISOString() },
    })
  })
  .client(async ({ next }) => {
    const result = await next()
    console.log('Server time:', result.context.serverTime)
    return result
  })
```

> **Warning**: The return type of `next` in client middleware can only be inferred from middleware known in the current middleware chain. For the most accurate return types, place middleware with server-to-client context at the end of the chain.

## Global Middleware

Apply middleware to all server functions by registering it globally. Both server and function middleware can be used globally:

```tsx
// app/global-middleware.ts
import { registerGlobalMiddleware } from '@tanstack/react-start'

const globalAuthMiddleware = createMiddleware().server(({ next, context }) => {
  // Authentication logic
  return next({ context: { user: getCurrentUser() } })
})

registerGlobalMiddleware({
  middleware: [globalAuthMiddleware],
})
```

For type safety with global middleware, include it in your server function's middleware array:

```tsx
const fn = createServerFn()
  .middleware([globalAuthMiddleware]) // Types will be inferred
  .handler(async ({ context }) => {
    console.log(context.user) // Type-safe!
  })
```

## Chaining Middleware

Chain multiple middleware together using the `middleware` method. Type-safe context and validation are inherited from parent middleware:

```tsx
const authMiddleware = createMiddleware().server(({ next }) => {
  // Authentication logic
  return next({ context: { user: getCurrentUser() } })
})

const loggingMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(({ next, context }) => {
    console.log('User:', context.user) // Type-safe access to inherited context
    return next()
  })
```

## Execution Order

Middleware executes in a nested, wrapping pattern. Each middleware wraps around the next, creating an "onion" structure where execution flows down the chain, then back up in reverse order:

```tsx
const authMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('🔐 Auth: Before')
  const result = await next()
  console.log('🔐 Auth: After')
  return result
})

const loggingMiddleware = createMiddleware().server(async ({ next }) => {
  console.log('📝 Log: Before')
  const result = await next()
  console.log('📝 Log: After')
  return result
})

const myServerFn = createServerFn()
  .middleware([authMiddleware, loggingMiddleware])
  .handler(async () => {
    console.log('⚡ Handler: Executing')
    return { message: 'Success!' }
  })

// When called, prints:
// 🔐 Auth: Before
// 📝 Log: Before
// ⚡ Handler: Executing
// 📝 Log: After
// 🔐 Auth: After
```

### Dependency Order

Middleware executes in dependency order: global middleware first, then local middleware dependencies:

```tsx
// 1. Global middleware (always first)
registerGlobalMiddleware({ middleware: [globalAuth] })

// 2. Then local middleware dependencies in order
const combined = createMiddleware()
  .middleware([authMiddleware, loggingMiddleware])
  .server(({ next }) => next())

// Full execution: globalAuth → authMiddleware → loggingMiddleware → combined → handler
```

## Tree Shaking

Code is automatically optimized for each environment:

- **Server**: All middleware code is included
- **Client**: Server-only code (like `server` method logic) is removed from the client bundle
