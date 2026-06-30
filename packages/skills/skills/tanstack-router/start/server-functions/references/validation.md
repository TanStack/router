# Server Function Validation

Input validation for server functions.

## With Zod

```tsx
import { createServerFn } from '@tanstack/start'
import { z } from 'zod'

const createPost = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string().min(1, 'Title required'),
      content: z.string().min(10, 'Content too short'),
      tags: z.array(z.string()).optional(),
    }),
  )
  .handler(async ({ data }) => {
    // data is fully typed: { title: string, content: string, tags?: string[] }
    return db.post.create({ data })
  })

// Usage - TypeScript enforces the schema
await createPost({
  data: {
    title: 'Hello',
    content: 'This is my post content',
    tags: ['typescript', 'react'],
  },
})
```

## With Valibot

```tsx
import { createServerFn } from '@tanstack/start'
import * as v from 'valibot'

const schema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
})

const login = createServerFn({ method: 'POST' })
  .validator(schema)
  .handler(async ({ data }) => {
    // data: { email: string, password: string }
  })
```

## Validation Errors

```tsx
const createUser = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      email: z.string().email(),
      name: z.string().min(2),
    }),
  )
  .handler(async ({ data }) => {
    return db.user.create({ data })
  })

// Client-side error handling
try {
  await createUser({ data: { email: 'invalid', name: 'A' } })
} catch (error) {
  // Validation errors are thrown
  console.error(error.message)
}
```

## Custom Validation

```tsx
const updateProfile = createServerFn({ method: 'POST' })
  .validator((data: unknown) => {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid data')
    }
    // Custom validation logic
    return data as { name: string; bio: string }
  })
  .handler(async ({ data }) => {
    // data is typed based on validator return
  })
```

## File Uploads

```tsx
const uploadFile = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      file: z.instanceof(File),
      description: z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const buffer = await data.file.arrayBuffer()
    // Process file
  })
```
