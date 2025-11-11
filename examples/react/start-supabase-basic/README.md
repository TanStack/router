# TanStack Start + Supabase Basic Example

This example demonstrates how to integrate Supabase authentication with TanStack Start.

## Setup

1. Create a Supabase project at https://supabase.com
2. Copy `.env` and fill in your Supabase credentials:
   ```
   SUPABASE_URL=your-project-url
   SUPABASE_ANON_KEY=your-anon-key
   ```
3. Install dependencies: `npm install`
4. Run: `npm run dev`

## ⚠️ Important: Server Function Serialization

**CRITICAL**: Server functions in TanStack Start can only return serializable data.

### The Problem

Supabase returns rich objects with non-serializable properties:

```typescript
const { data } = await supabase.auth.getUser()
// data.user contains functions, metadata, internal state
```

### The Solution

Extract only primitive values:

```typescript
✅ CORRECT:
return {
  email: data.user.email,      // string ✅
  id: data.user.id,            // string ✅
  role: data.user.role,        // string ✅
}

❌ WRONG:
return data.user  // Contains functions and metadata ❌
```

### What's Serializable?

| Type           | Serializable? | Example                    |
| -------------- | ------------- | -------------------------- |
| String         | ✅ Yes        | `"hello"`                  |
| Number         | ✅ Yes        | `42`                       |
| Boolean        | ✅ Yes        | `true`                     |
| null           | ✅ Yes        | `null`                     |
| Plain Object   | ✅ Yes        | `{ name: "Alice" }`        |
| Array          | ✅ Yes        | `[1, 2, 3]`                |
| ISO String     | ✅ Yes        | `new Date().toISOString()` |
| undefined      | ❌ No         | Use `null` instead         |
| Function       | ❌ No         | Cannot serialize           |
| Class Instance | ❌ No         | Extract fields             |
| Date Object    | ❌ No         | Convert to ISO string      |

## Common Errors & Solutions

### Error: "Cannot serialize function"

**Cause**: Returning an object with methods
**Fix**: Extract only primitive values

```typescript
// ❌ Wrong
return data.user

// ✅ Correct
return {
  email: data.user.email,
  id: data.user.id,
}
```

### Error: "Cannot serialize undefined"

**Cause**: A field is `undefined` instead of `null`
**Fix**: Use `null` or omit the field entirely

```typescript
// ❌ Wrong
return {
  name: data.user.name, // might be undefined
}

// ✅ Correct
return {
  name: data.user.name ?? null, // convert undefined to null
}
```

### Error: React Hydration Mismatch

**Cause**: Server and client render different HTML
**Fix**: Ensure consistent data structure between server/client

## Project Structure

```
src/
├── routes/
│   ├── __root.tsx          # Root layout with user fetching
│   ├── _authed.tsx         # Protected route layout
│   ├── index.tsx           # Home page
│   ├── login.tsx           # Login page
│   ├── signup.tsx          # Signup page
│   └── _authed/
│       └── posts.$postId.tsx
├── components/
│   ├── Auth.tsx            # Authentication UI
│   └── Login.tsx
├── utils/
│   ├── supabase.ts         # Supabase client config
│   └── posts.ts
└── styles/
    └── app.css
```

## How It Works

### 1. User Authentication Check (`__root.tsx`)

The root route uses a server function to check authentication:

```typescript
const fetchUser = createServerFn({ method: 'GET' }).handler(async () => {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user?.email) {
    return null
  }

  // IMPORTANT: Only return serializable fields!
  return {
    email: data.user.email,
  }
})
```

### 2. Protected Routes (`_authed.tsx`)

Routes prefixed with `_authed` redirect unauthenticated users to login:

```typescript
beforeLoad: ({ context }) => {
  if (!context.user) {
    throw redirect({ to: '/login' })
  }
}
```

### 3. Supabase Client (`utils/supabase.ts`)

Server-side Supabase client with cookie handling:

```typescript
export function getSupabaseServerClient() {
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          /* ... */
        },
        setAll(cookies) {
          /* ... */
        },
      },
    },
  )
}
```

## Learn More

- [TanStack Start Documentation](https://tanstack.com/start/latest)
- [TanStack Start Server Functions](https://tanstack.com/start/latest/docs/framework/react/server-functions)
- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase SSR Guide](https://supabase.com/docs/guides/auth/server-side-rendering)

## Troubleshooting

### Authentication not persisting

Make sure cookies are properly configured in `utils/supabase.ts`

### TypeScript errors

Run `npm run build` to check for type errors

### Can't connect to Supabase

Verify your `.env` file has correct credentials

## Example Deployment

This example works with:

- ✅ Cloudflare Pages
- ✅ Netlify
- ✅ Vercel
- ✅ Node.js servers

See deployment guides in the TanStack Start documentation.
