---
name: databases-integration
---

# Database Integration

Integrating TanStack Start with database providers.

## General Pattern

All database integrations follow the same pattern - call into your database from server functions:

```tsx
import { createServerFn } from '@tanstack/react-start'

const db = createDatabaseClient()

export const getUsers = createServerFn().handler(async () => {
  return db.query('SELECT * FROM users')
})

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    return db.insert('users', data)
  })
```

## Neon (Recommended)

Serverless PostgreSQL with automatic scaling.

### Installation

```bash
npm install @neondatabase/serverless
```

### Configuration

```tsx
// db/index.ts
import { neon } from '@neondatabase/serverless'

export const sql = neon(process.env.DATABASE_URL!)
```

### Usage in Server Functions

```tsx
import { createServerFn } from '@tanstack/react-start'
import { sql } from '../db'

export const getUsers = createServerFn().handler(async () => {
  const users = await sql`SELECT * FROM users`
  return users
})

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    const [user] = await sql`
      INSERT INTO users (name, email) 
      VALUES (${data.name}, ${data.email})
      RETURNING *
    `
    return user
  })
```

### With Drizzle ORM

```bash
npm install drizzle-orm
npm install -D drizzle-kit
```

```tsx
// db/schema.ts
import { pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})
```

```tsx
// db/index.ts
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

const sql = neon(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

```tsx
// Server function
import { db } from '../db'
import { users } from '../db/schema'

export const getUsers = createServerFn().handler(async () => {
  return db.select().from(users)
})
```

## Convex

Real-time database with automatic sync.

### Installation

```bash
npm install convex
npx convex dev  # Initialize Convex
```

### Schema Definition

```tsx
// convex/schema.ts
import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.string(),
  }),
  posts: defineTable({
    title: v.string(),
    content: v.string(),
    authorId: v.id('users'),
  }),
})
```

### Convex Functions

```tsx
// convex/users.ts
import { query, mutation } from './_generated/server'
import { v } from 'convex/values'

export const list = query({
  handler: async (ctx) => {
    return ctx.db.query('users').collect()
  },
})

export const create = mutation({
  args: { name: v.string(), email: v.string() },
  handler: async (ctx, args) => {
    return ctx.db.insert('users', args)
  },
})
```

### Usage in Components

```tsx
import { useQuery, useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'

function UserList() {
  const users = useQuery(api.users.list)
  const createUser = useMutation(api.users.create)

  return (
    <div>
      {users?.map((user) => (
        <div key={user._id}>{user.name}</div>
      ))}
      <button
        onClick={() => createUser({ name: 'New', email: 'new@example.com' })}
      >
        Add User
      </button>
    </div>
  )
}
```

### Provider Setup

```tsx
// routes/__root.tsx
import { ConvexProvider, ConvexReactClient } from 'convex/react'

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)

export const Route = createRootRoute({
  component: () => (
    <ConvexProvider client={convex}>
      <Outlet />
    </ConvexProvider>
  ),
})
```

## Prisma

Type-safe ORM with Prisma Postgres or any PostgreSQL.

### Installation

```bash
npm install @prisma/client
npm install -D prisma
npx prisma init
```

### Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        Int      @id @default(autoincrement())
  name      String
  email     String   @unique
  posts     Post[]
  createdAt DateTime @default(now())
}

model Post {
  id        Int      @id @default(autoincrement())
  title     String
  content   String
  author    User     @relation(fields: [authorId], references: [id])
  authorId  Int
}
```

### Generate Client

```bash
npx prisma generate
npx prisma db push  # Sync schema to database
```

### Client Setup

```tsx
// db/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

### Usage in Server Functions

```tsx
import { createServerFn } from '@tanstack/react-start'
import { prisma } from '../db/prisma'

export const getUsers = createServerFn().handler(async () => {
  return prisma.user.findMany({
    include: { posts: true },
  })
})

export const createUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    return prisma.user.create({ data })
  })

export const getUserWithPosts = createServerFn()
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    return prisma.user.findUnique({
      where: { id: data.id },
      include: { posts: true },
    })
  })
```

## Drizzle (Standalone)

Lightweight TypeScript ORM.

### Installation

```bash
npm install drizzle-orm postgres
npm install -D drizzle-kit
```

### Schema

```tsx
// db/schema.ts
import { pgTable, serial, text, timestamp, integer } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at').defaultNow(),
})

export const posts = pgTable('posts', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  authorId: integer('author_id').references(() => users.id),
})
```

### Client Setup

```tsx
// db/index.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const client = postgres(process.env.DATABASE_URL!)
export const db = drizzle(client, { schema })
```

### Usage

```tsx
import { db } from '../db'
import { users, posts } from '../db/schema'
import { eq } from 'drizzle-orm'

export const getUsers = createServerFn().handler(async () => {
  return db.select().from(users)
})

export const getUserWithPosts = createServerFn()
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }) => {
    return db.query.users.findFirst({
      where: eq(users.id, data.id),
      with: { posts: true },
    })
  })
```

## SQLite with Turso

Edge-compatible SQLite.

### Installation

```bash
npm install @libsql/client drizzle-orm
```

### Configuration

```tsx
// db/index.ts
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

export const db = drizzle(client)
```

## Environment Variables

```bash
# .env
DATABASE_URL="postgresql://user:password@host:5432/database"

# Neon
DATABASE_URL="postgres://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb"

# Convex (client-side, use VITE_ prefix)
VITE_CONVEX_URL="https://xxx.convex.cloud"

# Turso
TURSO_DATABASE_URL="libsql://xxx.turso.io"
TURSO_AUTH_TOKEN="xxx"
```

## Best Practices

### Connection Pooling

```tsx
// For serverless, use connection pooling
const sql = neon(process.env.DATABASE_URL!, {
  fetchConnectionCache: true,
})
```

### Error Handling

```tsx
export const createUser = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string }) => data)
  .handler(async ({ data }) => {
    try {
      return await db.insert(users).values(data).returning()
    } catch (error) {
      if (error.code === '23505') {
        return { error: 'Email already exists' }
      }
      throw error
    }
  })
```

### Transactions

```tsx
// Drizzle
export const transferFunds = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    return db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ balance: sql`balance - ${data.amount}` })
        .where(eq(accounts.id, data.fromId))
      await tx
        .update(accounts)
        .set({ balance: sql`balance + ${data.amount}` })
        .where(eq(accounts.id, data.toId))
    })
  },
)

// Prisma
export const transferFunds = createServerFn({ method: 'POST' }).handler(
  async ({ data }) => {
    return prisma.$transaction([
      prisma.account.update({
        where: { id: data.fromId },
        data: { balance: { decrement: data.amount } },
      }),
      prisma.account.update({
        where: { id: data.toId },
        data: { balance: { increment: data.amount } },
      }),
    ])
  },
)
```
