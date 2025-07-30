# How to Create Basic Server Functions

Create and use server functions with validation, error handling, and client integration patterns.

## Quick Start

```typescript
// app/functions/hello.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

export const sayHello = createServerFn()
  .validator(z.object({ name: z.string() }))
  .handler(async ({ data }) => {
    // This runs on the server
    return { message: `Hello, ${data.name}!` }
  })
```

```tsx
// app/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { sayHello } from '../functions/hello'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [result, setResult] = useState('')

  const handleSubmit = async () => {
    try {
      const response = await sayHello({ data: { name: 'World' } })
      setResult(response.message)
    } catch (error) {
      console.error('Server function failed:', error)
    }
  }

  return (
    <div>
      <button onClick={handleSubmit}>Say Hello</button>
      {result && <p>{result}</p>}
    </div>
  )
}
```

## Step-by-Step Implementation

### 1. Create Your First Server Function

Create a new file for your server function:

```typescript
// app/functions/user.ts
import { createServerFn } from '@tanstack/start'

// Basic server function without validation
export const getServerTime = createServerFn()
  .handler(async () => {
    return {
      timestamp: new Date().toISOString(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    }
  })
```

### 2. Add Input Validation

Use validation libraries like Zod or Valibot for type-safe inputs:

#### With Zod

```typescript
// app/functions/user.ts
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  age: z.number().min(13).optional(),
})

export const createUser = createServerFn()
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
    // data is fully typed based on the schema
    const user = {
      id: Math.random().toString(36),
      email: data.email,
      name: data.name,
      age: data.age,
      createdAt: new Date().toISOString(),
    }
    
    // Simulate database save
    console.log('Creating user:', user)
    
    return user
  })
```

#### With Valibot

```typescript
// app/functions/user.ts
import { createServerFn } from '@tanstack/start'
import { object, string, number, email, minLength, minValue, optional } from 'valibot'

const CreateUserSchema = object({
  email: string([email()]),
  name: string([minLength(2)]),
  age: optional(number([minValue(13)])),
})

export const createUser = createServerFn()
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
    // Implementation same as above
  })
```

### 3. HTTP Methods

Server functions support GET and POST (POST is default):

```typescript
// POST (default)
export const createUser = createServerFn()
  .validator(z.object({ name: z.string() }))
  .handler(async ({ data }) => {
    return { id: 1, name: data.name }
  })

// GET with query parameters
export const getUserById = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    return { id: data.id, name: 'John Doe' }
  })
```



### 4. Using Server Functions in Loaders

```tsx
// app/functions/users.ts
export const getUsers = createServerFn({ method: 'GET' })
  .handler(async () => {
    return await db.users.findMany()
  })

export const getUserById = createServerFn({ method: 'GET' })
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await db.users.findById(data.id)
    if (!user) throw new Error('User not found')
    return user
  })
```

```tsx
// app/routes/users/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getUsers } from '../../functions/users'

export const Route = createFileRoute('/users/')({
  loader: async () => {
    const users = await getUsers()
    return { users }
  },
  component: UsersPage,
})

function UsersPage() {
  const { users } = Route.useLoaderData()
  
  return (
    <div>
      <h1>Users</h1>
      {users.map(user => (
        <div key={user.id}>
          <h2>{user.name}</h2>
          <p>{user.email}</p>
        </div>
      ))}
    </div>
  )
}
```

```tsx
// app/routes/users/$userId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getUserById } from '../../functions/users'

export const Route = createFileRoute('/users/$userId')({
  loader: async ({ params }) => {
    const user = await getUserById({ data: { id: params.userId } })
    return { user }
  },
  component: UserDetail,
})

function UserDetail() {
  const { user } = Route.useLoaderData()
  
  return (
    <div>
      <h1>{user.name}</h1>
      <p>Email: {user.email}</p>
      <p>Created: {new Date(user.createdAt).toLocaleDateString()}</p>
    </div>
  )
}
```

### 5. Using Server Functions in Client Components

```tsx
import { useState } from 'react'
import { createUser } from '../functions/users'

function CreateUserForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleCreateUser = async () => {
    setLoading(true)
    setError('')
    
    try {
      await createUser({
        data: { email: 'user@example.com', name: 'New User', age: 25 }
      })
      // Optionally refresh or navigate
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <button onClick={handleCreateUser} disabled={loading}>
        {loading ? 'Creating...' : 'Create User'}
      </button>
      {error && <div style={{ color: 'red' }}>Error: {error}</div>}
    </div>
  )
}
```



### 6. File Organization

```
app/functions/
├── auth.ts         # Authentication functions
├── users.ts        # User management
└── posts.ts        # Content functions
```

```typescript
// app/functions/users.ts  
export const getUsers = createServerFn()...
export const createUser = createServerFn()...
export const updateUser = createServerFn()...
```

## Production Checklist

### Security

- [ ] **Input Validation**: All server functions use proper validation schemas
- [ ] **Error Handling**: Sensitive information not exposed in error messages
- [ ] **Authorization**: Access control implemented where needed
- [ ] **Rate Limiting**: Consider implementing rate limiting for public endpoints

### Performance

- [ ] **Efficient Queries**: Database queries are optimized
- [ ] **Caching**: Implement caching where appropriate
- [ ] **Error Boundaries**: Client components handle server function errors gracefully
- [ ] **Loading States**: UI shows loading indicators during server function calls

### Type Safety

- [ ] **Validation Schemas**: All inputs validated with Zod/Valibot
- [ ] **Return Types**: Server functions have explicit return types
- [ ] **Error Types**: Custom error classes for different error scenarios
- [ ] **Client Integration**: TypeScript correctly infers types in client code

### Testing

- [ ] **Unit Tests**: Server function logic tested in isolation
- [ ] **Integration Tests**: End-to-end testing of client-server communication
- [ ] **Error Scenarios**: Error handling paths tested
- [ ] **Validation Testing**: Input validation edge cases covered

## Common Problems

### Problem: "Cannot read properties of undefined" when calling server functions

**Cause**: Server function not properly imported or called incorrectly.

**Solution**:
```typescript
// ❌ Incorrect - missing await
const result = getUserById({ data: { id: '123' } })

// ✅ Correct - with await
const result = await getUserById({ data: { id: '123' } })

// ❌ Incorrect - wrong import path
import { getUserById } from './wrong-path'

// ✅ Correct - proper import path
import { getUserById } from '../functions/database'
```

### Problem: Validation errors not being caught properly

**Cause**: Missing error handling or incorrect validation schema.

**Solution**:
```typescript
// ❌ Incorrect - validation error not handled
try {
  const result = await createUser({ data: { email: 'invalid' } })
} catch (error) {
  // This won't catch validation errors properly
  console.log(error.message)
}

// ✅ Correct - proper error handling
try {
  const result = await createUser({ data: { email: 'invalid' } })
} catch (error) {
  if (error.message.includes('validation')) {
    // Handle validation error
    setValidationError(error.message)
  } else {
    // Handle other errors
    setGeneralError(error.message)
  }
}
```

### Problem: TypeScript errors with server function types

**Cause**: Missing or incorrect validation schema types.

**Solution**:
```typescript
// ❌ Incorrect - schema and handler types don't match
const updateUser = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    // TypeScript error: data.id is string but treating as number
    const userId = parseInt(data.id)
    return { id: userId }
  })

// ✅ Correct - consistent types
const updateUser = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const userId = parseInt(data.id, 10)
    return { id: userId }
  })
```

### Problem: Server function errors not reaching client

**Cause**: Errors being swallowed or not properly thrown.

**Solution**:
```typescript
// ❌ Incorrect - error swallowed
export const riskyFunction = createServerFn()
  .handler(async () => {
    try {
      // risky operation
      return { success: true }
    } catch (error) {
      console.error(error) // Error logged but not thrown
      return { success: false } // Client doesn't know about error
    }
  })

// ✅ Correct - error properly propagated
export const riskyFunction = createServerFn()
  .handler(async () => {
    try {
      // risky operation
      return { success: true }
    } catch (error) {
      console.error('Server function error:', error)
      throw new Error('Operation failed. Please try again.')
    }
  })
```

### Problem: Performance issues with large payloads

**Cause**: Sending too much data through server functions.

**Solution**:
```typescript
// ❌ Incorrect - sending large objects
export const processLargeData = createServerFn()
  .validator(z.object({ 
    data: z.array(z.object({
      // Large complex object
    }))
  }))
  .handler(async ({ data }) => {
    // Processing large payload
  })

// ✅ Correct - use pagination or streaming
export const processDataBatch = createServerFn()
  .validator(z.object({ 
    batchId: z.string(),
    offset: z.number(),
    limit: z.number().max(100)
  }))
  .handler(async ({ data }) => {
    // Process smaller batches
  })
```

## Common Next Steps

After setting up basic server functions, you might want to:

- [Write Type-Safe Server Functions](./write-type-safe-server-functions.md) - Optimize TypeScript performance and avoid common type errors
- [Use Server Functions with Forms](./use-server-functions-with-forms.md) - Integrate server functions with forms for validated submissions

<!-- Additional Next Steps (commented until guides exist)
- [Add middleware to server functions](./use-server-function-middleware.md)
- [Implement authentication with server functions](./implement-authentication.md)
- [Deploy server functions to production](./deploy-to-cloudflare.md)
- [Handle redirects in server functions](./handle-redirects-server-functions.md)
-->

## Related Resources

- [TanStack Start Server Functions Documentation](../server-functions.md)
- [Write Isomorphic, Client-Only, and Server-Only Code](./write-isomorphic-client-server-code.md)
- [Zod Validation Library](https://zod.dev/)
- [Valibot Validation Library](https://valibot.dev/)
- [GitHub Issue #4533: Server Function TypeScript Issues](https://github.com/TanStack/router/issues/4533)