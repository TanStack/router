# Database Access

Server-side database patterns.

## Direct Database Access

```tsx
import { createServerFn } from '@tanstack/start'
import { db } from '~/lib/db'

const getPosts = createServerFn().handler(async () => {
  // Direct database access - only runs on server
  return db.post.findMany({
    orderBy: { createdAt: 'desc' },
    include: { author: true },
  })
})

const createPost = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      title: z.string(),
      content: z.string(),
    }),
  )
  .handler(async ({ data }) => {
    return db.post.create({
      data: {
        title: data.title,
        content: data.content,
      },
    })
  })
```

## Prisma Setup

```tsx
// lib/db.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as { prisma?: PrismaClient }

export const db = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db
}
```

## Drizzle Setup

```tsx
// lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client)

// Usage
const posts = await db
  .select()
  .from(postsTable)
  .orderBy(desc(postsTable.createdAt))
```

## Transactions

```tsx
const transferFunds = createServerFn({ method: 'POST' })
  .validator(
    z.object({
      fromId: z.string(),
      toId: z.string(),
      amount: z.number().positive(),
    }),
  )
  .handler(async ({ data }) => {
    return db.$transaction(async (tx) => {
      await tx.account.update({
        where: { id: data.fromId },
        data: { balance: { decrement: data.amount } },
      })

      await tx.account.update({
        where: { id: data.toId },
        data: { balance: { increment: data.amount } },
      })

      return { success: true }
    })
  })
```

## Connection Pooling

For serverless deployments:

```tsx
// Use connection pooler URL
const db = new PrismaClient({
  datasources: {
    db: { url: process.env.DATABASE_POOL_URL },
  },
})
```
