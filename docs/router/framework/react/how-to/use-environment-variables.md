# How to Use Environment Variables in TanStack Router

Learn how to configure and use environment variables in your TanStack Router application for API endpoints, feature flags, and build configuration across different bundlers.

## Quick Start

Environment variables in TanStack Router are primarily used for client-side configuration and must follow bundler-specific naming conventions for security.

```bash
# .env
VITE_API_URL=https://api.example.com
VITE_ENABLE_DEVTOOLS=true
```

```typescript
// Route configuration
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  loader: async () => {
    const apiUrl = import.meta.env.VITE_API_URL
    const response = await fetch(`${apiUrl}/posts`)
    return response.json()
  },
  component: PostsList,
})
```

## Environment Variable Access Patterns

### Vite-Based Projects (Most Common)

With Vite, environment variables must be prefixed with `VITE_` to be accessible in client code:

```typescript
// Route loaders
export const Route = createFileRoute('/dashboard')({
  loader: async () => {
    const apiUrl = import.meta.env.VITE_API_URL        // ✅ Works
    const apiKey = import.meta.env.VITE_PUBLIC_API_KEY // ✅ Works
    
    // This would be undefined (security feature):
    // const secret = import.meta.env.SECRET_KEY        // ❌ Undefined
    
    return fetchDashboardData(apiUrl, apiKey)
  },
})

// Components
export function ApiStatus() {
  const isDev = import.meta.env.DEV           // ✅ Built-in Vite variable
  const isProd = import.meta.env.PROD         // ✅ Built-in Vite variable
  const mode = import.meta.env.MODE           // ✅ development/production
  
  return (
    <div>
      Environment: {mode}
      {isDev && <DevToolsPanel />}
    </div>
  )
}
```

### Webpack-Based Projects

Configure webpack's DefinePlugin to inject environment variables:

```typescript
// webpack.config.js
const webpack = require('webpack')

module.exports = {
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(process.env.API_URL),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    }),
  ],
}

// Usage in routes
export const Route = createFileRoute('/api-data')({
  loader: async () => {
    const response = await fetch(`${process.env.API_URL}/data`)
    return response.json()
  },
})
```

### Rspack-Based Projects

Rspack uses the `PUBLIC_` prefix convention:

```bash
# .env
PUBLIC_API_URL=https://api.example.com
PUBLIC_FEATURE_FLAG=true
```

```typescript
// Route usage
export const Route = createFileRoute('/features')({
  loader: async () => {
    const apiUrl = import.meta.env.PUBLIC_API_URL
    return fetch(`${apiUrl}/features`).then(r => r.json())
  },
  component: () => {
    const enableFeature = import.meta.env.PUBLIC_FEATURE_FLAG === 'true'
    return enableFeature ? <NewFeature /> : <OldFeature />
  },
})
```

### ESBuild Projects

Configure defines manually:

```typescript
// build script
import { build } from 'esbuild'

await build({
  entryPoints: ['src/main.tsx'],
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.API_URL': `"${process.env.API_URL}"`,
  },
})
```

## Common Patterns

### API Configuration in Route Loaders

```typescript
// src/routes/posts/index.tsx
import { createFileRoute } from '@tanstack/react-router'

const fetchPosts = async () => {
  const baseUrl = import.meta.env.VITE_API_URL
  const apiKey = import.meta.env.VITE_API_KEY
  
  const response = await fetch(`${baseUrl}/posts`, {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  })
  
  if (!response.ok) {
    throw new Error('Failed to fetch posts')
  }
  
  return response.json()
}

export const Route = createFileRoute('/posts/')({
  loader: fetchPosts,
  errorComponent: ({ error }) => (
    <div>Error loading posts: {error.message}</div>
  ),
})
```

### Environment-Based Route Configuration

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      {/* Only show devtools in development */}
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
})
```

### Feature Flags in Routes

```typescript
// src/lib/features.ts
export const features = {
  enableNewDashboard: import.meta.env.VITE_ENABLE_NEW_DASHBOARD === 'true',
  enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
  debugMode: import.meta.env.DEV,
}

// src/routes/dashboard/index.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { features } from '../../lib/features'

export const Route = createFileRoute('/dashboard/')({
  beforeLoad: () => {
    // Redirect to old dashboard if new one is disabled
    if (!features.enableNewDashboard) {
      throw redirect({ to: '/dashboard/legacy' })
    }
  },
  component: NewDashboard,
})
```

### Authentication Configuration

```typescript
// src/lib/auth.ts
export const authConfig = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN,
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID,
  redirectUri: `${window.location.origin}/callback`,
}

// src/routes/_authenticated.tsx
import { createFileRoute, redirect } from '@tanstack/react-router'
import { authConfig } from '../lib/auth'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    const isAuthenticated = await checkAuthStatus()
    
    if (!isAuthenticated) {
      // Redirect to auth provider
      const authUrl = `https://${authConfig.domain}/authorize?client_id=${authConfig.clientId}&redirect_uri=${authConfig.redirectUri}`
      window.location.href = authUrl
      return
    }
  },
})
```

### Search Params with Environment Config

```typescript
// src/routes/search.tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
})

export const Route = createFileRoute('/search')({
  validateSearch: searchSchema,
  loader: async ({ search }) => {
    const apiUrl = import.meta.env.VITE_SEARCH_API_URL
    const params = new URLSearchParams({
      q: search.q || '',
      category: search.category || 'all',
      api_key: import.meta.env.VITE_SEARCH_API_KEY,
    })
    
    const response = await fetch(`${apiUrl}/search?${params}`)
    return response.json()
  },
})
```

## Environment File Setup

### File Hierarchy (Vite)

Vite loads environment files in this order:

```
.env.local          # Local overrides (add to .gitignore)
.env.production     # Production-specific
.env.development    # Development-specific
.env                # Default (commit to git)
```

### Example Configuration

**.env** (committed to repository):
```bash
# API Configuration
VITE_API_URL=https://api.example.com
VITE_API_VERSION=v1

# Feature Flags
VITE_ENABLE_NEW_UI=false
VITE_ENABLE_ANALYTICS=true

# Auth Configuration (public keys only)
VITE_AUTH0_DOMAIN=your-domain.auth0.com
VITE_AUTH0_CLIENT_ID=your-client-id

# Build Configuration
VITE_APP_NAME=TanStack Router App
VITE_APP_VERSION=1.0.0
```

**.env.local** (add to .gitignore):
```bash
# Development overrides
VITE_API_URL=http://localhost:3001
VITE_ENABLE_NEW_UI=true
VITE_DEBUG_MODE=true
```

**.env.production**:
```bash
# Production-specific
VITE_API_URL=https://api.prod.example.com
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_NEW_UI=true
```

## Type Safety

### Vite TypeScript Declarations

Create `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  // API Configuration
  readonly VITE_API_URL: string
  readonly VITE_API_VERSION: string
  readonly VITE_API_KEY?: string
  
  // Feature Flags
  readonly VITE_ENABLE_NEW_UI: string
  readonly VITE_ENABLE_ANALYTICS: string
  readonly VITE_DEBUG_MODE?: string
  
  // Authentication
  readonly VITE_AUTH0_DOMAIN: string
  readonly VITE_AUTH0_CLIENT_ID: string
  
  // App Configuration
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### Runtime Validation

Use Zod to validate environment variables at startup:

```typescript
// src/config/env.ts
import { z } from 'zod'

const envSchema = z.object({
  VITE_API_URL: z.string().url(),
  VITE_API_VERSION: z.string(),
  VITE_AUTH0_DOMAIN: z.string(),
  VITE_AUTH0_CLIENT_ID: z.string(),
  VITE_APP_NAME: z.string(),
  VITE_ENABLE_NEW_UI: z.string(),
  VITE_ENABLE_ANALYTICS: z.string(),
})

// Validate at app startup
export const env = envSchema.parse(import.meta.env)

// Typed helper functions
export const isFeatureEnabled = (flag: keyof typeof env) => {
  return env[flag] === 'true'
}
```

### Usage with Type Safety

```typescript
// src/routes/api-data.tsx
import { createFileRoute } from '@tanstack/react-router'
import { env, isFeatureEnabled } from '../config/env'

export const Route = createFileRoute('/api-data')({
  loader: async () => {
    // TypeScript knows these are strings and exist
    const response = await fetch(`${env.VITE_API_URL}/${env.VITE_API_VERSION}/data`)
    return response.json()
  },
  component: () => {
    return (
      <div>
        <h1>{env.VITE_APP_NAME}</h1>
        {isFeatureEnabled('VITE_ENABLE_NEW_UI') && <NewUIComponent />}
      </div>
    )
  },
})
```

## Bundler-Specific Configuration

### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    TanStackRouterVite(),
  ],
  // Environment variables are handled automatically
  // Custom environment variable handling:
  define: {
    // Global constants
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
  },
})
```

### Webpack Configuration

```typescript
// webpack.config.js
const { TanStackRouterWebpack } = require('@tanstack/router-webpack-plugin')
const webpack = require('webpack')

module.exports = {
  plugins: [
    new TanStackRouterWebpack(),
    new webpack.DefinePlugin({
      // Inject environment variables
      'process.env.API_URL': JSON.stringify(process.env.API_URL),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.API_URL),
    }),
  ],
}
```

### Rspack Configuration

```typescript
// rspack.config.js
const { TanStackRouterRspack } = require('@tanstack/router-rspack-plugin')

module.exports = {
  plugins: [
    new TanStackRouterRspack(),
  ],
  // Rspack automatically handles PUBLIC_ prefixed variables
  // Custom handling:
  builtins: {
    define: {
      'process.env.API_URL': JSON.stringify(process.env.PUBLIC_API_URL),
    },
  },
}
```

## Production Checklist

- [ ] All client-exposed variables use appropriate prefix (`VITE_`, `PUBLIC_`, etc.)
- [ ] No sensitive data (API secrets, private keys) in environment variables
- [ ] `.env.local` is in `.gitignore`
- [ ] Production environment variables are configured on hosting platform
- [ ] Required environment variables are validated at build time
- [ ] TypeScript declarations are up to date
- [ ] Feature flags are properly configured for production
- [ ] API URLs point to production endpoints

## Common Problems

### Environment Variable is Undefined

**Problem**: `import.meta.env.MY_VARIABLE` returns `undefined`

**Solutions**:
1. **Add correct prefix**: Use `VITE_MY_VARIABLE` for Vite, `PUBLIC_MY_VARIABLE` for Rspack
2. **Restart dev server**: Environment changes require restart
3. **Check file location**: `.env` must be in project root
4. **Verify bundler configuration**: Ensure variables are properly injected

**Example**:
```bash
# ❌ Won't work (no prefix)
API_URL=https://api.example.com

# ✅ Works with Vite
VITE_API_URL=https://api.example.com

# ✅ Works with Rspack  
PUBLIC_API_URL=https://api.example.com
```

### Variable Not Updating

**Problem**: Environment variable changes aren't reflected in app

**Solutions**:
1. **Restart development server** - Required for new variables
2. **Check file hierarchy** - `.env.local` overrides `.env`
3. **Clear browser cache** - Hard refresh (Ctrl+Shift+R)
4. **Verify correct file** - Make sure you're editing the right `.env` file

### TypeScript Errors

**Problem**: `Property 'VITE_MY_VAR' does not exist on type 'ImportMetaEnv'`

**Solution**: Add declaration to `src/vite-env.d.ts`:
```typescript
interface ImportMetaEnv {
  readonly VITE_MY_VAR: string
}
```

### Build Errors

**Problem**: Missing environment variables during build

**Solutions**:
1. **Configure CI/CD**: Set variables in build environment
2. **Add validation**: Check required variables at build time
3. **Use .env files**: Ensure production `.env` files exist
4. **Check bundler config**: Verify environment variable injection

### Security Issues

**Problem**: Accidentally exposing sensitive data

**Solutions**:
1. **Never use secrets in client variables** - They're visible in browser
2. **Use server-side proxies** for sensitive API calls
3. **Audit bundle** - Check built files for leaked secrets
4. **Follow naming conventions** - Only prefixed variables are exposed

### Runtime vs Build-time Confusion

**Problem**: Variables not available at runtime

**Solutions**:
1. **Understand static replacement** - Variables are replaced at build time
2. **Use server-side for dynamic values** - Use APIs for runtime configuration
3. **Validate at startup** - Check all required variables exist

## Common Next Steps

<!-- [Set Up Authentication](./setup-authentication.md) - Configure auth providers with environment variables -->
<!-- [Deploy to Production](./deploy-to-production.md) - Set up production environment variables -->
<!-- [Set Up API Integration](./setup-api-integration.md) - Configure API endpoints and keys -->

## Related Resources

- [TanStack Router File-Based Routing](../routing/file-based-routing.md) - Learn about route configuration
- [Vite Environment Variables](https://vitejs.dev/guide/env-and-mode.html) - Official Vite documentation
- [Webpack DefinePlugin](https://webpack.js.org/plugins/define-plugin/) - Webpack environment configuration