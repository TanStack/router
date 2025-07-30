# How to Write Type-Safe Server Functions

Ensure type safety in server functions using TanStack Start's validation APIs and TypeScript inference.

## Quick Start

```typescript
// ✅ Type-safe with validation
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  age: z.number().min(13).optional()
})

export const createUser = createServerFn()
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
    // data is fully typed based on schema
    const user = await db.users.create({
      email: data.email,
      name: data.name,
      age: data.age
    })
    return user // TypeScript infers return type
  })
```

## Input Validation

### Zod Integration

```typescript
import { z } from 'zod'

const UpdateProfileSchema = z.object({
  userId: z.string(),
  profile: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    bio: z.string().max(500).optional()
  })
})

export const updateProfile = createServerFn()
  .validator(UpdateProfileSchema)
  .handler(async ({ data }) => {
    // data.userId is string
    // data.profile.firstName is string
    // data.profile.bio is string | undefined
    return await db.profiles.update(data.userId, data.profile)
  })
```

### Valibot Integration

```typescript
import { object, string, number, email, minLength, minValue, optional } from 'valibot'

const CreateUserSchema = object({
  email: string([email()]),
  name: string([minLength(2)]),
  age: optional(number([minValue(13)]))
})

export const createUser = createServerFn()
  .validator(CreateUserSchema)
  .handler(async ({ data }) => {
    // Fully typed based on Valibot schema
    return await db.users.create(data)
  })
```

## Error Handling

```typescript
export const getUserById = createServerFn()
  .validator(z.object({ id: z.string() }))
  .handler(async ({ data }) => {
    const user = await db.users.findById(data.id)
    
    if (!user) {
      throw new Error('User not found')
    }
    
    return user
  })

// Client usage with type safety
try {
  const user = await getUserById({ data: { id: 'user-123' } })
  // user is fully typed
} catch (error) {
  // Handle validation or runtime errors
  console.error(error.message)
}
```

## Schema Composition

```typescript
// Reusable schemas
const UserIdSchema = z.object({
  userId: z.string()
})

const ProfileDataSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().email()
})

// Compose schemas
const UpdateUserSchema = UserIdSchema.merge(
  z.object({
    profile: ProfileDataSchema
  })
)

export const updateUser = createServerFn()
  .validator(UpdateUserSchema)
  .handler(async ({ data }) => {
    return await db.users.update(data.userId, data.profile)
  })
```

## File Validation

```typescript
const FileUploadSchema = z.object({
  file: z.instanceof(File),
  category: z.enum(['image', 'document'])
})

export const uploadFile = createServerFn()
  .validator(FileUploadSchema)
  .handler(async ({ data }) => {
    const { file, category } = data
    
    // Validate file type
    if (category === 'image' && !file.type.startsWith('image/')) {
      throw new Error('Invalid file type for image category')
    }
    
    const url = await storage.upload(file)
    return { url, category }
  })
```

## Production Checklist

### Validation
- [ ] **Input Validation**: All server functions use validation schemas
- [ ] **Schema Composition**: Reuse common schemas across functions
- [ ] **Error Messages**: Validation errors provide clear feedback

### Type Safety
- [ ] **Schema Inference**: Let TypeScript infer types from validation schemas
- [ ] **Runtime Safety**: Validation catches invalid data at runtime
- [ ] **Client Types**: Server function calls are fully typed on the client

## Common Problems

### Problem: Validation schema and usage out of sync

**Solution**: Use `z.infer` to derive types from schemas
```typescript
const UserSchema = z.object({
  id: z.string(),
  name: z.string()
})

type User = z.infer<typeof UserSchema>

// Use the same schema for validation and typing
export const createUser = createServerFn()
  .validator(UserSchema)
  .handler(async ({ data }): Promise<User> => {
    return data // data already matches User type
  })
```

### Problem: Complex nested validation

**Solution**: Break down complex schemas
```typescript
// ❌ Hard to manage
const ComplexSchema = z.object({
  user: z.object({
    profile: z.object({
      contact: z.object({
        email: z.string().email()
      })
    })
  })
})

// ✅ Composed schemas
const ContactSchema = z.object({
  email: z.string().email()
})

const ProfileSchema = z.object({
  contact: ContactSchema
})

const UserSchema = z.object({
  profile: ProfileSchema
})
```

## Related Resources

- [Create Basic Server Functions](./create-basic-server-functions.md) - Foundation concepts
- [Use Server Functions with Forms](./use-server-functions-with-forms.md) - Form validation patterns
- [Zod Documentation](https://zod.dev/)
- [Valibot Documentation](https://valibot.dev/)