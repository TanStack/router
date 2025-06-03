---
id: integrate-better-auth
title: Integrate Better Auth
---

> [!IMPORTANT]
> This guide is based on the upcoming work in the `alpha` branch of **TanStack Start**. We are actively working on exciting new features, and this guide will be updated soon.

This guide provides a step-by-step process to integrate [Better Auth](https://better-auth.com) with **TanStack Start**. We respect the powerful features of Better Auth and aim to make this implementation as smooth as possible.

## Step-by-Step

This step-by-step guide provides an overview of how to integrate Better Auth with TanStack Start using a starter template. The goal is to help you understand the basic steps involved in the implementation process so you can adapt them to your specific project needs.

### Prerequisites

Before we begin, this guide assumes your project structure looks like this:

```txt
.
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└──  src/
    ├── router.tsx
    └── routes/
        ├── __root.tsx
        ├── globals.css
        └── index.tsx
```

Alternatively, you can follow along by cloning the following [starter template](https://github.com/nrjdalal/awesome-templates/tree/main/tanstack-apps/tanstack-start):

```sh
npx gitpick nrjdalal/awesome-templates/tree/main/tanstack-apps/tanstack-start better-start
```

This structure or starter is a basic TanStack Start application, which we will integrate with TanStack Start.

![Image](https://github.com/user-attachments/assets/322f37b9-1af1-4082-bc88-56d270d684c5)

### 1. Install Required Dependencies

```sh
npm i better-auth drizzle-orm postgres
npm i -D drizzle-kit
```

### 2. Configure Environment Variables

```txt
# .env

BETTER_AUTH_URL=http://localhost:3000
# can be generated using `npx nanoid`
BETTER_AUTH_SECRET=
# can be generated using `npx pglaunch`
POSTGRES_URL=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
```

<!-- CAN CALLOUT TO SPONSER LIKE NEON FOR POSTGRES IN PRODUCTION -->

Updated project structure:

```txt
.
├── .env // [!code ++]
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└──  src/
    ├── router.tsx
    └── routes/
        ├── __root.tsx
        ├── globals.css
        └── index.tsx
```

### 3. Configure Drizzle ORM

```ts
// drizzle.config.ts

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.POSTGRES_URL!,
  },
  schema: 'src/db/schema',
  out: 'src/db/drizzle',
})
```

```ts
// src/db/index.ts

import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

declare global {
  var db: PostgresJsDatabase
}

let db: PostgresJsDatabase

if (process.env.NODE_ENV === 'production') {
  db = drizzle({
    client: postgres(process.env.POSTGRES_URL!, {
      ssl: {
        rejectUnauthorized: true,
      },
    }),
  })
} else {
  if (!global.db) {
    global.db = drizzle({
      client: postgres(process.env.POSTGRES_URL!),
    })
  }
  db = global.db
}

export { db }
```

```ts
// src/db/schema/auth.ts

import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified')
    .$defaultFn(() => false)
    .notNull(),
  image: text('image'),
  createdAt: timestamp('created_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
  updatedAt: timestamp('updated_at')
    .$defaultFn(() => /* @__PURE__ */ new Date())
    .notNull(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
  updatedAt: timestamp('updated_at').$defaultFn(
    () => /* @__PURE__ */ new Date(),
  ),
})
```

Updated project structure:

```txt
.
├── .env // [!code ++]
├── drizzle.config.ts // [!code ++]
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└──  src/
    ├── router.tsx
    ├── db/
    │   ├── index.ts // [!code ++]
    │   └── schema/
    │       └── auth.ts // [!code ++]
    └── routes/
        ├── __root.tsx
        ├── globals.css
        └── index.tsx
```

### 4. Configure Better Auth

```ts
// src/lib/auth/index.ts

import { db } from '@/db'
import { account, session, user, verification } from '@/db/schema/auth'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { reactStartCookies } from 'better-auth/react-start'

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user,
      session,
      account,
      verification,
    },
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
  plugins: [reactStartCookies()],
})
```

```ts
// src/lib/auth/client.ts

import { createAuthClient } from 'better-auth/react'

export const { signIn, signOut, useSession } = createAuthClient()
```

```ts
// src/routes/api/auth/$.ts

import { auth } from '@/lib/auth'

export const ServerRoute = createServerFileRoute().methods({
  GET: ({ request }) => {
    return auth.handler(request)
  },
  POST: ({ request }) => {
    return auth.handler(request)
  },
})
```

```tsx
// src/components/auth-button.tsx

import { signIn, signOut, useSession } from '@/lib/auth/client'
import { useLocation, useNavigate } from '@tanstack/react-router'

export default function Component() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { data: session } = useSession()

  if (session && pathname === '/') navigate({ to: '/dashboard' })
  if (!session && pathname === '/dashboard') navigate({ to: '/' })

  return session ? (
    <>
      <p>Welcome, {session.user.name}.</p>
      <button
        className="cursor-pointer rounded-full border px-4 py-1 text-gray-100 hover:opacity-80"
        onClick={async () => {
          await signOut()
          navigate({ to: '/' })
        }}
      >
        Log Out
      </button>
    </>
  ) : (
    <>
      <p>Please log in to continue.</p>
      <button
        className="cursor-pointer rounded-full border px-4 py-1 text-gray-100 hover:opacity-80"
        onClick={async () =>
          await signIn.social({
            provider: 'github',
            callbackURL: '/dashboard',
          })
        }
      >
        Login with Github
      </button>
    </>
  )
}
```

Updated project structure:

```txt
.
├── .env
├── drizzle.config.ts
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└──  src/
    ├── router.tsx
    ├── db/
    │   ├── index.ts
    │   └── schema/
    │       └── auth.ts
    ├── lib/
    │   ├── auth/
    │   │   ├── client.ts // [!code ++]
    │   │   └── index.ts // [!code ++]
    └── routes/
        ├── api/
        │   └── auth/
        │       └── $.ts // [!code ++]
        ├── components/
        │   └── auth-button.tsx // [!code ++]
        ├── __root.tsx
        ├── globals.css
        └── index.tsx
```

### 5. Generate Database Schema

```sh
npx drizzle-kit push

# [✓] Pulling schema from database...
# [✓] Changes applied
```

### 6. Add Auth Button Existing and New Routes

```tsx
// src/routes/index.tsx

import AuthButton from '@/components/auth-button' // [!code ++]

export const Route = createFileRoute({
  component: Component,
})

function Component() {
  return (
    <main className="bg-radial flex min-h-dvh flex-col items-center justify-center gap-y-4 from-cyan-950 to-black p-4 text-gray-100">
      <img
        className="aspect-square w-full max-w-sm"
        src="https://tanstack.com/assets/splash-dark-8nwlc0Nt.png"
        alt="TanStack Logo"
      />
      <h1 className="text-2xl">
        <span className="font-semibold">TanStack</span>
        &nbsp;
        <span className="text-cyan-500">Start</span>
      </h1>
      <AuthButton /> // [!code ++]
      <a
        className="rounded-full bg-gray-100 px-4 py-1 text-gray-900 hover:opacity-80"
        href="https://tanstack.com/start/latest"
        target="_blank"
      >
        Docs
      </a>
    </main>
  )
}
```

![Image](https://github.com/user-attachments/assets/776a43d6-cb24-403b-8923-d839386d576a)

Just copy `src/routes/index.tsx` to `src/routes/dashboard.tsx`.

```tsx
// src/routes/dashboard.tsx

import AuthButton from '@/components/auth-button'

export const Route = createFileRoute({
  component: Component,
})

function Component() {
  return (
    <main className="bg-radial flex min-h-dvh flex-col items-center justify-center gap-y-4 from-cyan-950 to-black p-4 text-gray-100">
      <img
        className="aspect-square w-full max-w-sm"
        src="https://tanstack.com/assets/splash-dark-8nwlc0Nt.png"
        alt="TanStack Logo"
      />
      <h1 className="text-2xl">
        <span className="font-semibold">TanStack</span>
        &nbsp;
        <span className="text-cyan-500">Start</span>
      </h1>
      <AuthButton />
      <a
        className="rounded-full bg-gray-100 px-4 py-1 text-gray-900 hover:opacity-80"
        href="https://tanstack.com/start/latest"
        target="_blank"
      >
        Docs
      </a>
    </main>
  )
}
```

![Image](https://github.com/user-attachments/assets/7dc6acc1-9b65-4196-8c37-89a01d1eda84)

Updated project structure:

```txt
.
├── .env
├── drizzle.config.ts
├── package.json
├── README.md
├── tsconfig.json
├── vite.config.ts
└──  src/
    ├── router.tsx
    ├── db/
    │   ├── index.ts
    │   └── schema/
    │       └── auth.ts
    ├── lib/
    │   ├── auth/
    │   │   ├── client.ts
    │   │   └── index.ts
    ├── components/
    │   └── auth-button.tsx
    └── routes/
        ├── api/
        │   └── auth/
        │       └── $.ts
        ├── __root.tsx
        ├── globals.css
        ├── index.tsx
        └── dashboard.tsx // [!code ++]
```

### 7. Verify the Implementation

Run the development server:

```sh
npm run dev
```

Visit `http://localhost:3000` in your browser. You should see the TanStack Start splash page with a "Login with Github" button. Clicking this button will redirect you to the Github login page, and upon successful login, you will be redirected back to the dashboard.

You can also visit `http://localhost:3000/dashboard` directly, but you will be redirected to the home page if you are not logged in and vice versa.

> If you encounter issues, review the steps above and ensure that file names and paths match exactly. For a reference implementation, see the [post-migration repository](https://github.com/nrjdalal/better-start) or website [demo](https://better-start.vercel.app).
