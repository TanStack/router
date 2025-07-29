# How to Write Type-Safe Server Functions

Optimize TypeScript performance and avoid common type errors when building server functions in TanStack Start. This guide focuses on advanced TypeScript patterns and performance optimizations.

## Quick Start

```typescript
// ❌ Problematic - causes "Type instantiation is excessively deep"
export const processComplexData = createServerFn()
  .validator(z.object({
    data: z.array(z.object({
      nested: z.object({
        deep: z.object({
          value: z.string()
        })
      })
    }))
  }))
  .handler(async ({ data }) => {
    return data.map(item => ({
      ...item,
      processed: true
    }))
  })

// ✅ Optimized - flattened types and explicit interfaces
interface ProcessedItem {
  id: string
  value: string
  processed: boolean
}

const ItemSchema = z.object({
  id: z.string(),
  value: z.string()
})

export const processComplexData = createServerFn()
  .validator(z.object({
    items: z.array(ItemSchema).max(100)
  }))
  .handler(async ({ data }): Promise<ProcessedItem[]> => {
    return data.items.map(item => ({
      id: item.id,
      value: item.value,
      processed: true
    }))
  })
```

## TypeScript Performance Patterns

### 1. Flatten Nested Type Structures

Deeply nested types cause TypeScript performance issues:

```typescript
// ❌ Avoid deep nesting
const DeepSchema = z.object({
  level1: z.object({
    level2: z.object({
      level3: z.object({
        level4: z.object({
          data: z.string()
        })
      })
    })
  })
})

// ✅ Use flat interfaces instead
interface UserPreferences {
  theme: 'light' | 'dark'
  language: string
  notifications: boolean
}

interface UserProfile {
  id: string
  email: string
  preferences: UserPreferences
}

const UserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark']),
  language: z.string(),
  notifications: z.boolean()
})

const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  preferences: UserPreferencesSchema
})

export const updateUserProfile = createServerFn()
  .validator(UserProfileSchema)
  .handler(async ({ data }): Promise<UserProfile> => {
    return data
  })
```

### 2. Use Explicit Return Types

Always specify return types to avoid inference overhead:

```typescript
// ❌ TypeScript infers complex return type
export const getComplexData = createServerFn()
  .handler(async ({ data }) => {
    return {
      users: await fetchUsers(),
      posts: await fetchPosts(),
      comments: await fetchComments()
    }
  })

// ✅ Explicit return type
interface DashboardData {
  users: User[]
  posts: Post[]
  comments: Comment[]
}

export const getDashboardData = createServerFn()
  .handler(async (): Promise<DashboardData> => {
    return {
      users: await fetchUsers(),
      posts: await fetchPosts(),
      comments: await fetchComments()
    }
  })
```

### 3. Optimize Array and Object Schemas

Limit array sizes and use discriminated unions:

```typescript
// ❌ Unbounded arrays cause performance issues
const ProblematicSchema = z.object({
  items: z.array(z.object({
    data: z.any() // Also avoid 'any'
  }))
})

// ✅ Bounded arrays with specific types
type ItemType = 'text' | 'image' | 'video'

interface BaseItem {
  id: string
  type: ItemType
  createdAt: string
}

interface TextItem extends BaseItem {
  type: 'text'
  content: string
}

interface ImageItem extends BaseItem {
  type: 'image'
  url: string
  alt: string
}

const TextItemSchema = z.object({
  id: z.string(),
  type: z.literal('text'),
  content: z.string(),
  createdAt: z.string()
})

const ImageItemSchema = z.object({
  id: z.string(),
  type: z.literal('image'),
  url: z.string().url(),
  alt: z.string(),
  createdAt: z.string()
})

const ItemSchema = z.discriminatedUnion('type', [
  TextItemSchema,
  ImageItemSchema
])

export const processItems = createServerFn()
  .validator(z.object({
    items: z.array(ItemSchema).max(50)
  }))
  .handler(async ({ data }): Promise<BaseItem[]> => {
    return data.items
  })
```

## Advanced Type Safety Patterns

### 1. Input/Output Type Separation

Separate input validation from internal processing types:

```typescript
// Input validation schema
const CreatePostInputSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).max(10).optional(),
  publishAt: z.string().datetime().optional()
})

type CreatePostInput = z.infer<typeof CreatePostInputSchema>

// Internal domain types
interface Post {
  id: string
  title: string
  content: string
  tags: string[]
  publishAt: Date | null
  createdAt: Date
  updatedAt: Date
  authorId: string
}

// Output type (what gets sent to client)
interface PostResponse {
  id: string
  title: string
  content: string
  tags: string[]
  publishAt: string | null
  createdAt: string
}

export const createPost = createServerFn()
  .validator(CreatePostInputSchema)
  .handler(async ({ data }): Promise<PostResponse> => {
    const post: Post = {
      id: generateId(),
      title: data.title,
      content: data.content,
      tags: data.tags || [],
      publishAt: data.publishAt ? new Date(data.publishAt) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
      authorId: getCurrentUserId()
    }
    
    await savePost(post)
    
    return {
      id: post.id,
      title: post.title,
      content: post.content,
      tags: post.tags,
      publishAt: post.publishAt?.toISOString() || null,
      createdAt: post.createdAt.toISOString()
    }
  })
```

### 2. Generic Type Utilities

Create reusable type utilities for common patterns:

```typescript
// Utility types for consistent API responses
type ApiResponse<T> = {
  data: T
  success: true
} | {
  error: string
  success: false
}

type PaginatedResponse<T> = ApiResponse<{
  items: T[]
  pagination: {
    page: number
    limit: number
    total: number
    hasNext: boolean
  }
}>

// Generic pagination schema
const createPaginationSchema = <T extends z.ZodType>(itemSchema: T) => {
  return z.object({
    page: z.number().min(1).default(1),
    limit: z.number().min(1).max(100).default(20),
    filters: itemSchema.partial().optional()
  })
}

// Usage
const UserFiltersSchema = z.object({
  email: z.string().email(),
  role: z.enum(['admin', 'user']),
  active: z.boolean()
})

export const getUsers = createServerFn()
  .validator(createPaginationSchema(UserFiltersSchema))
  .handler(async ({ data }): Promise<PaginatedResponse<User>> => {
    try {
      const result = await fetchPaginatedUsers(data)
      return {
        success: true,
        data: {
          items: result.users,
          pagination: result.pagination
        }
      }
    } catch (error) {
      return {
        success: false,
        error: 'Failed to fetch users'
      }
    }
  })
```

### 3. Type-Safe Error Handling

Create typed error hierarchies:

```typescript
// Base error classes with proper typing
abstract class AppError extends Error {
  abstract readonly code: string
  abstract readonly statusCode: number
}

class ValidationError extends AppError {
  readonly code = 'VALIDATION_ERROR'
  readonly statusCode = 400
  
  constructor(
    message: string,
    public readonly field: string
  ) {
    super(message)
    this.name = 'ValidationError'
  }
}

class NotFoundError extends AppError {
  readonly code = 'NOT_FOUND'
  readonly statusCode = 404
  
  constructor(resource: string, id: string) {
    super(`${resource} with id ${id} not found`)
    this.name = 'NotFoundError'
  }
}

// Type-safe error response
type ErrorResponse = {
  code: string
  message: string
  field?: string
}

export const getUserById = createServerFn()
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ApiResponse<User>> => {
    try {
      const user = await findUserById(data.id)
      if (!user) {
        throw new NotFoundError('User', data.id)
      }
      
      return {
        success: true,
        data: user
      }
    } catch (error) {
      if (error instanceof AppError) {
        return {
          success: false,
          error: error.message
        }
      }
      
      // Log unexpected errors but don't expose details
      console.error('Unexpected error:', error)
      return {
        success: false,
        error: 'Internal server error'
      }
    }
  })
```

## Performance Optimization Strategies

### 1. Schema Caching

Cache validation schemas to improve performance:

```typescript
// Schema cache to avoid recreation
const schemaCache = new Map<string, z.ZodSchema>()

function createCachedSchema<T extends z.ZodSchema>(
  key: string,
  schemaFactory: () => T
): T {
  if (!schemaCache.has(key)) {
    schemaCache.set(key, schemaFactory())
  }
  return schemaCache.get(key) as T
}

// Usage
const getUsersSchema = createCachedSchema('getUsers', () =>
  z.object({
    page: z.number().min(1),
    limit: z.number().min(1).max(100)
  })
)

export const getUsers = createServerFn()
  .validator(getUsersSchema)
  .handler(async ({ data }) => {
    // Handler implementation
  })
```

### 2. Lazy Type Loading

Use dynamic imports for complex type definitions:

```typescript
// types/user.ts - Separate file for complex types
export interface UserWithRelations {
  id: string
  email: string
  profile: UserProfile
  posts: Post[]
  comments: Comment[]
  permissions: Permission[]
}

// server function with lazy loading
export const getUserWithRelations = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }): Promise<UserWithRelations> => {
    // Dynamic import delays type loading until needed
    const { UserWithRelations } = await import('../types/user')
    
    const user = await fetchUserWithRelations(data.id)
    return user
  })
```

### 3. Selective Type Inference

Control TypeScript inference to improve performance:

```typescript
// Use const assertions to limit inference
const USER_ROLES = ['admin', 'user', 'moderator'] as const
type UserRole = typeof USER_ROLES[number]

// Instead of letting TypeScript infer everything
const createUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(USER_ROLES), // Explicit enum from const
  preferences: z.object({
    theme: z.literal('light').or(z.literal('dark')),
    language: z.string().length(2)
  })
}) satisfies z.ZodType<{
  email: string
  role: UserRole
  preferences: {
    theme: 'light' | 'dark'
    language: string
  }
}>
```

## Testing Type Safety

### 1. Type-Only Tests

Test your types without runtime overhead:

```typescript
// types.test.ts
import { expectType } from 'tsd'
import { createUser } from '../functions/users'

// Test input types
expectType<{
  email: string
  name: string
  age?: number
}>(await createUser({
  data: {
    email: 'test@example.com',
    name: 'Test User'
  }
}))

// Test that invalid inputs are rejected
// @ts-expect-error - Should fail with invalid email
createUser({
  data: {
    email: 'invalid-email',
    name: 'Test'
  }
})
```

### 2. Runtime Type Validation Tests

```typescript
// functions.test.ts
import { describe, it, expect } from 'vitest'
import { createUser } from '../functions/users'

describe('Type-safe server functions', () => {
  it('validates input correctly', async () => {
    await expect(
      createUser({
        data: {
          email: 'invalid-email',
          name: 'Test'
        }
      })
    ).rejects.toThrow('Invalid email')
  })
  
  it('returns correctly typed output', async () => {
    const result = await createUser({
      data: {
        email: 'test@example.com',
        name: 'Test User'
      }
    })
    
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('email', 'test@example.com')
    expect(result).toHaveProperty('createdAt')
  })
})
```

## Production Checklist

### TypeScript Configuration

- [ ] **Strict Mode**: `"strict": true` in tsconfig.json
- [ ] **No Unchecked Indexed Access**: `"noUncheckedIndexedAccess": true`
- [ ] **Exact Optional Property Types**: `"exactOptionalPropertyTypes": true`
- [ ] **Skip Lib Check**: `"skipLibCheck": true` for performance

### Schema Optimization

- [ ] **Array Limits**: All array schemas have `.max()` constraints
- [ ] **String Limits**: String schemas have reasonable length limits
- [ ] **Union Types**: Use discriminated unions instead of large unions
- [ ] **Schema Caching**: Frequently used schemas are cached

### Error Handling

- [ ] **Typed Errors**: Custom error classes with proper typing
- [ ] **Error Boundaries**: Client components handle typed errors
- [ ] **Validation Errors**: Clear, actionable validation messages
- [ ] **Production Errors**: Sensitive details not exposed in production

## Common Problems

### Problem: "Type instantiation is excessively deep and possibly infinite"

**Cause**: Deeply nested or recursive type structures.

**Solution**:
```typescript
// ❌ Problematic
type DeepNested = {
  level1: {
    level2: {
      level3: {
        data: string
      }
    }
  }
}

// ✅ Flattened
interface Config {
  theme: string
  language: string
}

interface UserSettings {
  config: Config
  userId: string
}
```

### Problem: Slow TypeScript compilation with server functions

**Cause**: Complex type inference or large union types.

**Solution**:
```typescript
// ❌ Slow inference
const complexHandler = createServerFn()
  .handler(async ({ data }) => {
    // TypeScript struggles to infer this
    return data.items.map(item => ({
      ...item,
      ...processItem(item),
      ...addMetadata(item)
    }))
  })

// ✅ Explicit types
interface ProcessedItem {
  id: string
  processed: boolean
  metadata: ItemMetadata
}

const optimizedHandler = createServerFn()
  .handler(async ({ data }): Promise<ProcessedItem[]> => {
    return data.items.map(item => processItemToType(item))
  })
```

### Problem: Validation schema and TypeScript types out of sync

**Cause**: Manually maintaining both schema and types.

**Solution**:
```typescript
// ✅ Single source of truth
const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string()
})

type User = z.infer<typeof UserSchema>

// Use the inferred type everywhere
export const createUser = createServerFn()
  .validator(UserSchema)
  .handler(async ({ data }): Promise<User> => {
    return data
  })
```

## Related Resources

- [Create Basic Server Functions](./create-basic-server-functions.md) - Foundation concepts
- [Zod Performance Tips](https://zod.dev/?id=performance)
- [TypeScript Performance Guidelines](https://github.com/microsoft/TypeScript/wiki/Performance)
- [GitHub Issue #4533: Server Function TypeScript Issues](https://github.com/TanStack/router/issues/4533)