---
id: server-functions
title: Server Functions
---

## What are Server Functions?

Server functions let you define server-only logic that can be called from anywhere in your application - loaders, components, hooks, or other server functions. They run on the server but can be invoked from client code seamlessly.

```tsx
import { createServerFn } from '@tanstack/react-start'

export const getServerTime = createServerFn().handler(async () => {
  // This runs only on the server
  return new Date().toISOString()
})

// Call from anywhere - components, loaders, hooks, etc.
const time = await getServerTime()
```

Server functions provide server capabilities (database access, environment variables, file system) while maintaining type safety across the network boundary.

## Basic Usage

Server functions are created with `createServerFn()` and can specify HTTP method:

```tsx
import { createServerFn } from '@tanstack/react-start'

// GET request (default)
export const getData = createServerFn().handler(async () => {
  return { message: 'Hello from server!' }
})

// POST request
export const saveData = createServerFn({ method: 'POST' }).handler(async () => {
  // Server-only logic
  return { success: true }
})
```

## Where to Call Server Functions

Call server functions from:

- **Route loaders** - Perfect for data fetching
- **Components** - Use with `useServerFn()` hook
- **Other server functions** - Compose server logic
- **Event handlers** - Handle form submissions, clicks, etc.

```tsx
// In a route loader
export const Route = createFileRoute('/posts')({
  loader: () => getPosts(),
})

// In a component
function PostList() {
  const getPosts = useServerFn(getServerPosts)

  const { data } = useQuery({
    queryKey: ['posts'],
    queryFn: () => getPosts(),
  })
}
```

## Parameters & Validation

Server functions accept a single `data` parameter. Since they cross the network boundary, validation ensures type safety and runtime correctness.

### Basic Parameters

```tsx
import { createServerFn } from '@tanstack/react-start'

export const greetUser = createServerFn({ method: 'GET' })
  .inputValidator((data: { name: string }) => data)
  .handler(async ({ data }) => {
    return `Hello, ${data.name}!`
  })

await greetUser({ data: { name: 'John' } })
```

### Validation with Zod

For robust validation, use schema libraries like Zod:

```tsx
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

const UserSchema = z.object({
  name: z.string().min(1),
  age: z.number().min(0),
})

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator(UserSchema)
  .handler(async ({ data }) => {
    // data is fully typed and validated
    return `Created user: ${data.name}, age ${data.age}`
  })
```

### Form Data

Handle form submissions with FormData:

```tsx
export const submitForm = createServerFn({ method: 'POST' })
  .inputValidator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error('Expected FormData')
    }

    return {
      name: data.get('name')?.toString() || '',
      email: data.get('email')?.toString() || '',
    }
  })
  .handler(async ({ data }) => {
    // Process form data
    return { success: true }
  })
```

## Raw Handler for Streaming Uploads

For advanced use cases like streaming file uploads or accessing the raw request body, use `.rawHandler()` instead of `.handler()`. This gives you direct access to the Request object without automatic body parsing.

### Why Use Raw Handler?

The raw handler is essential when you need to:

- **Stream large file uploads** directly to cloud storage without loading them into memory
- **Enforce size limits during upload** rather than after the entire file is loaded
- **Access raw request streams** for custom body parsing (e.g., multipart/form-data with busboy)
- **Implement proper backpressure** for large data transfers
- **Minimize memory footprint** for file uploads

### Basic Raw Handler

```tsx
import { createServerFn } from '@tanstack/react-start'

export const uploadFile = createServerFn({ method: 'POST' }).rawHandler(
  async ({ request, signal }) => {
    // Access the raw request object
    const contentType = request.headers.get('content-type')
    const body = await request.text()

    return new Response(
      JSON.stringify({
        contentType,
        size: body.length,
      }),
    )
  },
)
```

### Streaming File Upload Example

With raw handlers, you can stream files directly to cloud storage without buffering them in memory:

```tsx
import { createServerFn } from '@tanstack/react-start'

export const uploadFile = createServerFn({ method: 'POST' })
  .middleware([authMiddleware]) // Middleware context is available!
  .rawHandler(async ({ request, signal, context }) => {
    // Access middleware context (user, auth, etc.)
    const userId = context.user.id

    // Access the raw request body stream
    const body = request.body

    if (!body) {
      return new Response('No file provided', { status: 400 })
    }

    // Stream directly to your storage (S3, Azure, etc.)
    // You can use libraries like busboy to parse multipart/form-data
    // and enforce size limits DURING upload
    await streamToStorage(body, {
      userId,
      maxSize: 25 * 1024 * 1024, // 25MB limit
      signal, // Pass for cancellation support
    })

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  })
```

### Client-Side Usage

The raw handler works seamlessly from the client with FormData:

```tsx
import { useMutation } from '@tanstack/react-query'
import { uploadFile } from './server-functions'

function FileUpload() {
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData()
      formData.append('file', file)

      return uploadFile({ data: formData })
    },
  })

  return (
    <input
      type="file"
      onChange={(e) => {
        const file = e.target.files?.[0]
        if (file) uploadMutation.mutate(file)
      }}
    />
  )
}
```

### Key Differences from Regular Handler

| Feature      | `.handler()`                        | `.rawHandler()`                |
| ------------ | ----------------------------------- | ------------------------------ |
| Body Parsing | Automatic (FormData, JSON)          | Manual - you control it        |
| Memory Usage | Loads entire body into memory first | Can stream directly            |
| Size Limits  | Can't enforce during upload         | Enforce during upload          |
| Use Case     | Standard data/form handling         | Large files, streaming         |
| Parameters   | `{ data, context, signal }`         | `{ request, context, signal }` |

### Important Notes

1. **No automatic body parsing** - With `rawHandler`, the request body is NOT automatically parsed. You must handle it yourself.
2. **No data parameter** - Raw handlers receive `{ request, signal, context }` instead of the usual `{ data, context, signal }`. There is no automatic data parsing/validation.
3. **Middleware context is available** - Request middleware still runs and you have full access to the middleware context (authentication, user info, etc.).
4. **Response handling** - Always return a `Response` object from raw handlers.

## Error Handling & Redirects

Server functions can throw errors, redirects, and not-found responses that are handled automatically when called from route lifecycles or components using `useServerFn()`.

### Basic Errors

```tsx
import { createServerFn } from '@tanstack/react-start'

export const riskyFunction = createServerFn().handler(async () => {
  if (Math.random() > 0.5) {
    throw new Error('Something went wrong!')
  }
  return { success: true }
})

// Errors are serialized to the client
try {
  await riskyFunction()
} catch (error) {
  console.log(error.message) // "Something went wrong!"
}
```

### Redirects

Use redirects for authentication, navigation, etc:

```tsx
import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'

export const requireAuth = createServerFn().handler(async () => {
  const user = await getCurrentUser()

  if (!user) {
    throw redirect({ to: '/login' })
  }

  return user
})
```

### Not Found

Throw not-found errors for missing resources:

```tsx
import { createServerFn } from '@tanstack/react-start'
import { notFound } from '@tanstack/react-router'

export const getPost = createServerFn()
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const post = await db.findPost(data.id)

    if (!post) {
      throw notFound()
    }

    return post
  })
```

## Advanced Topics

For more advanced server function patterns and features, see these dedicated guides:

### Server Context & Request Handling

Access request headers, cookies, and response customization:

- `getRequest()` - Access the full request object
- `getRequestHeader()` - Read specific headers
- `setResponseHeader()` - Set custom response headers
- `setResponseStatus()` - Custom status codes

### Streaming

Stream typed data from server functions to the client. See the [Streaming Data from Server Functions guide](../streaming-data-from-server-functions).

### Raw Responses

Return `Response` objects binary data, or custom content types.

### Progressive Enhancement

Use server functions without JavaScript by leveraging the `.url` property with HTML forms.

### Middleware

Compose server functions with middleware for authentication, logging, and shared logic. See the [Middleware guide](../middleware.md).

### Static Server Functions

Cache server function results at build time for static generation. See [Static Server Functions](../static-server-functions).

### Request Cancellation

Handle request cancellation with `AbortSignal` for long-running operations.

### Function ID generation for production build

Server functions are addressed by a generated, stable function ID under the hood. These IDs are embedded into the client/SSR builds and used by the server to locate and import the correct module at runtime.

By default, IDs are SHA256 hashes of the same seed to keep bundles compact and avoid leaking file paths.
If two server functions end up with the same ID (including when using a custom generator), the system de-duplicates by appending an incrementing suffix like `_1`, `_2`, etc.

Customization:

You can customize function ID generation for the production build by providing a `generateFunctionId` function when configuring the TanStack Start Vite plugin.

Prefer deterministic inputs (filename + functionName) so IDs remain stable between builds.

Please note that this customization is **experimental** und subject to change.

Example:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      serverFns: {
        generateFunctionId: ({ filename, functionName }) => {
          // Return a custom ID string. If you return undefined, the default is used.
          return crypto
            .createHash('sha1')
            .update(`${filename}--${functionName}`)
            .digest('hex')
          return undefined
        },
      },
    }),
    react(),
  ],
})
```

---

> **Note**: Server functions use a compilation process that extracts server code from client bundles while maintaining seamless calling patterns. On the client, calls become `fetch` requests to the server.
