# Environment Variables

Server and client environment configuration.

## Server-Only Variables

```tsx
// Only accessible on server - safe for secrets
const apiKey = process.env.API_SECRET_KEY
const dbUrl = process.env.DATABASE_URL

const callAPI = createServerFn().handler(async () => {
  // Safe - runs on server only
  const response = await fetch('https://api.example.com', {
    headers: { Authorization: `Bearer ${process.env.API_SECRET!}` },
  })
  return response.json()
})
```

## Client-Safe Variables

Expose variables to client via configuration:

```ts
// app.config.ts
export default defineConfig({
  vite: {
    define: {
      'import.meta.env.PUBLIC_API_URL': JSON.stringify(
        process.env.PUBLIC_API_URL,
      ),
      'import.meta.env.PUBLIC_APP_NAME': JSON.stringify(
        process.env.PUBLIC_APP_NAME,
      ),
    },
  },
})
```

```tsx
// Accessible on client
function Component() {
  const apiUrl = import.meta.env.PUBLIC_API_URL
  return <span>{import.meta.env.PUBLIC_APP_NAME}</span>
}
```

## Environment Files

```bash
# .env (all environments)
PUBLIC_APP_NAME=MyApp

# .env.local (local development, gitignored)
DATABASE_URL=postgresql://localhost:5432/mydb
API_SECRET=dev-secret

# .env.production (production)
DATABASE_URL=postgresql://prod-host:5432/mydb
```

## Runtime Environment

```tsx
const getConfig = createServerFn().handler(async () => {
  return {
    environment: process.env.NODE_ENV,
    region: process.env.VERCEL_REGION,
    version: process.env.npm_package_version,
  }
})
```

## Type Safety

```ts
// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    DATABASE_URL: string
    API_SECRET: string
    SESSION_SECRET: string
    NODE_ENV: 'development' | 'production' | 'test'
  }
}
```

## Required Variables Check

```tsx
// lib/env.ts
function getEnv(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing env: ${key}`)
  return value
}

export const env = {
  databaseUrl: getEnv('DATABASE_URL'),
  apiSecret: getEnv('API_SECRET'),
}
```
