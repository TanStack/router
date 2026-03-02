---
name: auth-providers-integration
---

# Authentication Provider Integration

Integrating TanStack Start with authentication providers.

## Clerk

Complete authentication platform with pre-built UI components.

### Installation

```bash
npm install @clerk/tanstack-react-start
```

### Environment Variables

```bash
# .env
CLERK_PUBLISHABLE_KEY=pk_xxx
CLERK_SECRET_KEY=sk_xxx
```

### Provider Setup

```tsx
// routes/__root.tsx
import { ClerkProvider } from '@clerk/tanstack-react-start'
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <ClerkProvider>
      <Outlet />
    </ClerkProvider>
  ),
})
```

### Sign In/Up Components

```tsx
// routes/sign-in.tsx
import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/sign-in')({
  component: () => (
    <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
  ),
})
```

### Protected Routes

```tsx
// routes/_authed.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuth } from '@clerk/tanstack-react-start/server'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ request }) => {
    const { userId } = await getAuth(request)

    if (!userId) {
      throw redirect({ to: '/sign-in' })
    }

    return { userId }
  },
})
```

### Server Functions with Clerk

```tsx
import { createServerFn } from '@tanstack/react-start'
import { getAuth } from '@clerk/tanstack-react-start/server'

export const getPrivateData = createServerFn().handler(async ({ request }) => {
  const { userId } = await getAuth(request)

  if (!userId) {
    throw new Error('Unauthorized')
  }

  return db.query.users.findFirst({
    where: eq(users.clerkId, userId),
  })
})
```

### User Button

```tsx
import { UserButton } from '@clerk/tanstack-react-start'

function Header() {
  return (
    <header>
      <nav>...</nav>
      <UserButton afterSignOutUrl="/" />
    </header>
  )
}
```

## Supabase

Open-source Firebase alternative with auth, database, and storage.

### Installation

```bash
npm install @supabase/supabase-js @supabase/ssr
```

### Client Setup

```tsx
// utils/supabase.ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!,
  )
}
```

```tsx
// utils/supabase-server.ts
import { createServerClient } from '@supabase/ssr'

export function createServerSupabase(request: Request) {
  const cookies = parseCookies(request.headers.get('cookie') || '')

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookies[name],
        set: () => {},
        remove: () => {},
      },
    },
  )
}
```

### Authentication

```tsx
// routes/login.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createClient } from '../utils/supabase'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const supabase = createClient()

  const handleLogin = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      console.error(error)
    }
  }

  const handleOAuth = async (provider: 'google' | 'github') => {
    await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div>
      <button onClick={() => handleOAuth('google')}>Sign in with Google</button>
      <button onClick={() => handleOAuth('github')}>Sign in with GitHub</button>
    </div>
  )
}
```

### Protected Routes

```tsx
// routes/_authed.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { createServerSupabase } from '../utils/supabase-server'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ request }) => {
    const supabase = createServerSupabase(request)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      throw redirect({ to: '/login' })
    }

    return { user }
  },
})
```

### Server Functions with Supabase

```tsx
import { createServerFn } from '@tanstack/react-start'
import { createServerSupabase } from '../utils/supabase-server'

export const getProfile = createServerFn().handler(async ({ request }) => {
  const supabase = createServerSupabase(request)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) throw new Error('Unauthorized')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
})
```

## WorkOS

Enterprise-ready authentication with SSO.

### Installation

```bash
npm install @workos-inc/node
```

### Configuration

```tsx
// utils/workos.ts
import { WorkOS } from '@workos-inc/node'

export const workos = new WorkOS(process.env.WORKOS_API_KEY!)
```

### SSO Login

```tsx
import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import { workos } from '../utils/workos'

export const initiateSSO = createServerFn({ method: 'POST' })
  .inputValidator((data: { organization: string }) => data)
  .handler(async ({ data }) => {
    const authorizationUrl = workos.sso.getAuthorizationUrl({
      organization: data.organization,
      redirectUri: `${process.env.APP_URL}/auth/callback`,
      clientId: process.env.WORKOS_CLIENT_ID!,
    })

    throw redirect({ href: authorizationUrl })
  })
```

### Callback Handler

```tsx
// routes/auth/callback.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { workos } from '../../utils/workos'
import { useAppSession } from '../../utils/session'

export const Route = createFileRoute('/auth/callback')({
  loader: async ({ location }) => {
    const code = new URLSearchParams(location.search).get('code')

    if (!code) {
      throw redirect({ to: '/login' })
    }

    const { profile } = await workos.sso.getProfileAndToken({
      code,
      clientId: process.env.WORKOS_CLIENT_ID!,
    })

    const session = await useAppSession()
    await session.update({
      userId: profile.id,
      email: profile.email,
    })

    throw redirect({ to: '/dashboard' })
  },
})
```

## Auth.js (NextAuth)

Open-source authentication with 80+ OAuth providers.

### Installation

```bash
npm install @auth/core
```

### Configuration

```tsx
// auth.ts
import { Auth } from '@auth/core'
import GitHub from '@auth/core/providers/github'
import Google from '@auth/core/providers/google'

export const authConfig = {
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  secret: process.env.AUTH_SECRET!,
}
```

## Better Auth

TypeScript-first authentication library.

### Installation

```bash
npm install better-auth
```

### Configuration

```tsx
// auth.ts
import { betterAuth } from 'better-auth'

export const auth = betterAuth({
  database: {
    type: 'postgres',
    url: process.env.DATABASE_URL!,
  },
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
})
```

## DIY Session-Based Auth

Build your own authentication with TanStack Start sessions.

### Session Setup

```tsx
// utils/session.ts
import { useSession } from '@tanstack/react-start/server'

type SessionData = {
  userId?: string
  email?: string
  role?: string
}

export function useAppSession() {
  return useSession<SessionData>({
    name: 'app-session',
    password: process.env.SESSION_SECRET!, // 32+ characters
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: true,
    },
  })
}
```

### Login Server Function

```tsx
import { createServerFn } from '@tanstack/react-start'
import { redirect } from '@tanstack/react-router'
import bcrypt from 'bcryptjs'
import { useAppSession } from '../utils/session'

export const loginFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const user = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    })

    if (!user) {
      return { error: 'Invalid credentials' }
    }

    const isValid = await bcrypt.compare(data.password, user.password)
    if (!isValid) {
      return { error: 'Invalid credentials' }
    }

    const session = await useAppSession()
    await session.update({
      userId: user.id,
      email: user.email,
      role: user.role,
    })

    throw redirect({ to: '/dashboard' })
  })
```

### Logout

```tsx
export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const session = await useAppSession()
  await session.clear()
  throw redirect({ to: '/' })
})
```

### Protected Routes

```tsx
// routes/_authed.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { useAppSession } from '../utils/session'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async () => {
    const session = await useAppSession()

    if (!session.data.userId) {
      throw redirect({
        to: '/login',
        search: { redirect: location.href },
      })
    }

    return { userId: session.data.userId }
  },
})
```

### Registration

```tsx
export const registerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { email: string; password: string; name: string }) => data,
  )
  .handler(async ({ data }) => {
    const existing = await db.query.users.findFirst({
      where: eq(users.email, data.email),
    })

    if (existing) {
      return { error: 'Email already registered' }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const [user] = await db
      .insert(users)
      .values({
        email: data.email,
        password: hashedPassword,
        name: data.name,
      })
      .returning()

    const session = await useAppSession()
    await session.update({ userId: user.id, email: user.email })

    throw redirect({ to: '/dashboard' })
  })
```

## Security Best Practices

### Password Hashing

```tsx
import bcrypt from 'bcryptjs'

// Hash with sufficient rounds
const hashedPassword = await bcrypt.hash(password, 12)

// Compare safely
const isValid = await bcrypt.compare(inputPassword, hashedPassword)
```

### Rate Limiting

```tsx
const loginAttempts = new Map<string, { count: number; resetTime: number }>()

function rateLimit(ip: string): boolean {
  const now = Date.now()
  const attempts = loginAttempts.get(ip)

  if (!attempts || now > attempts.resetTime) {
    loginAttempts.set(ip, { count: 1, resetTime: now + 15 * 60 * 1000 })
    return true
  }

  if (attempts.count >= 5) return false

  attempts.count++
  return true
}
```

### Input Validation

```tsx
import { z } from 'zod'

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
})

export const loginFn = createServerFn({ method: 'POST' })
  .inputValidator((data) => loginSchema.parse(data))
  .handler(async ({ data }) => {
    // data is validated
  })
```
