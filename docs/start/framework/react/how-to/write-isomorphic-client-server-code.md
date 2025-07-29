# How to Write Isomorphic, Client-Only, and Server-Only Code

This guide covers the fundamental concept of execution boundaries in TanStack Start applications - understanding where code runs and how to control execution context.

## Quick Start

TanStack Start provides several APIs to control where code executes:

- **Isomorphic code**: Runs on both server and client
- **Server-only code**: Runs exclusively on the server  
- **Client-only code**: Runs exclusively in the browser

```tsx
// execution-boundaries-example.tsx
import { 
  createServerFn, 
  serverOnly, 
  clientOnly, 
  createIsomorphicFn 
} from '@tanstack/react-start'
import { ClientOnly } from '@tanstack/react-router'

// ✅ Isomorphic: Works everywhere
function formatDate(date: Date) {
  return date.toLocaleDateString()
}

// ✅ Server-only: serverOnly() helper
const getServerConfig = serverOnly(() => {
  return process.env.DATABASE_URL
})

// ✅ Server-only: createServerFn for RPC
const getServerTime = createServerFn().handler(async () => {
  return new Date().toISOString()
})

// ✅ Client-only: clientOnly() helper
const trackEvent = clientOnly((event: string) => {
  if (window.gtag) window.gtag('event', event)
})

// ✅ Isomorphic: Different implementations per environment
const getEnvironment = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')

// ✅ Client-only: Component wrapper
function MyComponent() {
  return (
    <ClientOnly fallback={<div>Loading...</div>}>
      <ExpensiveBrowserOnlyComponent />
    </ClientOnly>
  )
}

export { 
  formatDate, 
  getServerConfig, 
  getServerTime, 
  trackEvent, 
  getEnvironment,
  MyComponent 
}
```

---

## Understanding Execution Boundaries

### The Server-Client Divide

TanStack Start applications execute in two environments:

1. **Server Environment** (Node.js/Bun/Deno)
   - Has access to file system, environment variables, databases
   - No browser APIs (window, document, localStorage)
   - Runs during SSR and server function execution

2. **Client Environment** (Browser)  
   - Has access to DOM, browser APIs, user interactions
   - No access to server-side resources
   - Runs after hydration and during user interactions

### Choosing the Right API

**When to use each execution boundary API:**

| API | Use Case | Behavior |
|-----|----------|----------|
| `serverOnly(fn)` | Server utilities, environment access | Throws error on client |
| `clientOnly(fn)` | Browser APIs, analytics, client interactions | Throws error on server |
| `createServerFn()` | Remote procedure calls, data mutations | Network request from client |
| `createIsomorphicFn()` | Different implementations per environment | Executes appropriate version |
| `<ClientOnly>` | Components that need browser APIs | Renders fallback during SSR |
| Manual checks | Simple conditional logic | Manual `typeof window` checks |

**Examples:**

```tsx
// ✅ Use serverOnly() for environment access
const getApiKey = serverOnly(() => process.env.API_KEY)

// ✅ Use clientOnly() for browser APIs  
const saveToStorage = clientOnly((key, value) => 
  localStorage.setItem(key, value)
)

// ✅ Use createServerFn() for data operations
const updateUser = createServerFn()
  .handler(async ({ userId, data }) => {
    // Database operations
  })

// ✅ Use createIsomorphicFn() for different implementations
const getDeviceInfo = createIsomorphicFn()
  .server(() => ({ type: 'server' }))
  .client(() => ({ type: 'client', userAgent: navigator.userAgent }))

// ✅ Use ClientOnly for components requiring browser APIs
<ClientOnly fallback={<StaticChart />}>
  <InteractiveChart />
</ClientOnly>
```

### Isomorphic vs Universal Code

**Isomorphic code** runs identically in both environments:

```tsx
// ✅ Isomorphic: Uses only standard JavaScript
function calculateTax(price: number, rate: number) {
  return price * rate
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// ✅ Isomorphic: Works with both Date objects
function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}
```

---

## Writing Server-Only Code

### Using the serverOnly() Helper

The `serverOnly()` helper ensures functions only execute on the server:

```tsx
// server-only-helpers.ts
import { serverOnly } from '@tanstack/react-start'

// ✅ Server-only: Function wrapper
export const getServerConfig = serverOnly(() => {
  return {
    databaseUrl: process.env.DATABASE_URL,
    apiKey: process.env.SECRET_API_KEY
  }
})

// ✅ Server-only: With parameters
export const hashPassword = serverOnly((password: string) => {
  const bcrypt = require('bcrypt')
  return bcrypt.hashSync(password, 10)
})

// ✅ Server-only: Async operations
export const readServerFile = serverOnly(async (filename: string) => {
  const fs = await import('node:fs/promises')
  return fs.readFile(filename, 'utf-8')
})
```

**How it works:**
- On the server: Function executes normally
- On the client: Throws an error `"serverOnly() functions can only be called on the server!"`

### Using Server Functions

Server functions guarantee server-only execution:

```tsx
// server-functions.ts
import { createServerFn } from '@tanstack/react-start'
import fs from 'node:fs/promises'

// ✅ Server-only: File system access
export const readConfig = createServerFn().handler(async () => {
  const config = await fs.readFile('config.json', 'utf-8')
  return JSON.parse(config)
})

// ✅ Server-only: Environment variables
export const getDatabaseUrl = createServerFn().handler(() => {
  return process.env.DATABASE_URL
})

// ✅ Server-only: Sensitive operations
export const hashPassword = createServerFn()
  .validator((password: string) => password)
  .handler(async ({ data: password }) => {
    const bcrypt = await import('bcrypt')
    return bcrypt.hash(password, 10)
  })
```

### Server-Only Utilities

For shared server logic that isn't a server function:

```tsx
// utils/server-only.ts

// ✅ Throw error if called on client
export function ensureServerOnly() {
  if (typeof window !== 'undefined') {
    throw new Error('This function can only run on the server')
  }
}

// ✅ Server-only database connection
export function createDatabaseConnection() {
  ensureServerOnly()
  
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT!),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  }
}

// ✅ Server-only file operations
export async function writeLogFile(message: string) {
  ensureServerOnly()
  
  const fs = await import('node:fs/promises')
  const timestamp = new Date().toISOString()
  await fs.appendFile('app.log', `${timestamp}: ${message}\n`)
}
```

---

## Writing Client-Only Code

### Using the clientOnly() Helper

The `clientOnly()` helper ensures functions only execute in the browser:

```tsx
// client-only-helpers.ts
import { clientOnly } from '@tanstack/react-start'

// ✅ Client-only: Browser API access
export const getViewportSize = clientOnly(() => {
  return {
    width: window.innerWidth,
    height: window.innerHeight
  }
})

// ✅ Client-only: Local storage operations
export const saveToStorage = clientOnly((key: string, value: any) => {
  localStorage.setItem(key, JSON.stringify(value))
})

// ✅ Client-only: Analytics tracking
export const trackPageView = clientOnly((page: string) => {
  if (window.gtag) {
    window.gtag('config', 'GA_TRACKING_ID', {
      page_title: page
    })
  }
})
```

**How it works:**
- On the client: Function executes normally
- On the server: Throws an error `"clientOnly() functions can only be called on the client!"`

### Using the ClientOnly Component

The `ClientOnly` component renders children only after hydration:

```tsx
// components/InteractiveChart.tsx
import { ClientOnly } from '@tanstack/react-router'
import { useState } from 'react'

function ExpensiveChart() {
  const [data, setData] = useState([])
  
  // This component needs browser APIs and is expensive to render
  useEffect(() => {
    // Browser-only chart library
    import('chart.js').then(({ Chart }) => {
      // Initialize chart
    })
  }, [])
  
  return <canvas id="chart" />
}

function ChartPlaceholder() {
  return (
    <div className="w-full h-64 bg-gray-100 flex items-center justify-center">
      <span>Loading chart...</span>
    </div>
  )
}

export function InteractiveChart() {
  return (
    <ClientOnly fallback={<ChartPlaceholder />}>
      <ExpensiveChart />
    </ClientOnly>
  )
}
```

### Browser API Access

Code that requires browser APIs should be client-only:

```tsx
// utils/client-only.ts

// ✅ Client-only: DOM manipulation
export function updatePageTitle(title: string) {
  if (typeof window === 'undefined') {
    console.warn('updatePageTitle called on server, skipping')
    return
  }
  document.title = title
}

// ✅ Client-only: Local storage
export function saveToLocalStorage(key: string, value: any) {
  if (typeof window === 'undefined') {
    throw new Error('localStorage is not available on the server')
  }
  localStorage.setItem(key, JSON.stringify(value))
}

// ✅ Client-only: User interactions
export function copyToClipboard(text: string) {
  if (typeof window === 'undefined') {
    throw new Error('Clipboard API is not available on the server')
  }
  
  return navigator.clipboard.writeText(text)
}

// ✅ Client-only: Analytics
export function trackEvent(eventName: string, properties: Record<string, any>) {
  if (typeof window === 'undefined') return
  
  // Analytics only runs in browser
  if (window.gtag) {
    window.gtag('event', eventName, properties)
  }
}
```

### Component Client-Only Logic

Handle client-only logic in components:

```tsx
// components/ClientOnlyComponent.tsx
import { useEffect, useState } from 'react'

export function ClientOnlyComponent() {
  const [isClient, setIsClient] = useState(false)
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    // ✅ Mark as client-side after hydration
    setIsClient(true)
    
    // ✅ Client-only: Window resize listener
    const updateSize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }
    
    updateSize()
    window.addEventListener('resize', updateSize)
    
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // ✅ Avoid hydration mismatches
  if (!isClient) {
    return <div>Loading...</div>
  }

  return (
    <div>
      <h2>Client-Only Information</h2>
      <p>Window size: {windowSize.width} x {windowSize.height}</p>
      <p>User agent: {navigator.userAgent}</p>
    </div>
  )
}
```

---

## Writing Isomorphic Code

### Using createIsomorphicFn()

The `createIsomorphicFn()` helper creates functions with different implementations for server and client:

```tsx
// isomorphic-functions.ts
import { createIsomorphicFn } from '@tanstack/react-start'

// ✅ Different implementations per environment
export const getEnvironmentInfo = createIsomorphicFn()
  .server(() => ({
    type: 'server',
    runtime: process.version,
    platform: process.platform
  }))
  .client(() => ({
    type: 'client',
    userAgent: navigator.userAgent,
    language: navigator.language
  }))

// ✅ With parameters
export const formatMessage = createIsomorphicFn()
  .server((message: string) => `[SERVER]: ${message}`)
  .client((message: string) => `[CLIENT]: ${message}`)

// ✅ Async operations
export const getCurrentTime = createIsomorphicFn()
  .server(async () => {
    // Server might get time from database
    return new Date().toISOString()
  })
  .client(async () => {
    // Client gets time from browser
    return new Date().toISOString()
  })

// ✅ Server-only implementation (client gets no-op)
export const logToFile = createIsomorphicFn()
  .server(async (message: string) => {
    const fs = await import('node:fs/promises')
    await fs.appendFile('app.log', `${new Date()}: ${message}\n`)
  })
  // No .client() - becomes no-op on client

// ✅ Client-only implementation (server gets no-op)
export const trackAnalytics = createIsomorphicFn()
  .client((event: string, data: any) => {
    if (window.gtag) {
      window.gtag('event', event, data)
    }
  })
  // No .server() - becomes no-op on server
```

**Usage in components:**

```tsx
// components/EnvironmentDisplay.tsx
export function EnvironmentDisplay() {
  const [info, setInfo] = useState(null)
  
  useEffect(() => {
    // Works on both server and client with different implementations
    const envInfo = getEnvironmentInfo()
    setInfo(envInfo)
  }, [])
  
  return (
    <div>
      <h3>Environment Info:</h3>
      <pre>{JSON.stringify(info, null, 2)}</pre>
    </div>
  )
}
```

### Environment Detection

Safely detect execution environment:

```tsx
// utils/environment.ts

// ✅ Isomorphic: Safe environment detection
export const isServer = typeof window === 'undefined'
export const isClient = typeof window !== 'undefined'

// ✅ Isomorphic: Conditional execution
export function logMessage(message: string) {
  if (isServer) {
    console.log(`[SERVER]: ${message}`)
  } else {
    console.log(`[CLIENT]: ${message}`)
  }
}

// ✅ Isomorphic: Feature detection
export function canUseLocalStorage() {
  try {
    return typeof localStorage !== 'undefined'
  } catch {
    return false
  }
}
```

### Isomorphic Data Fetching

Route loaders are isomorphic by design:

```tsx
// routes/users.tsx
import { createFileRoute } from '@tanstack/react-router'

// ✅ Isomorphic: Runs on server and client
export const Route = createFileRoute('/users')({
  loader: async () => {
    console.log(`Loading users on ${typeof window === 'undefined' ? 'server' : 'client'}`)
    
    // ✅ Isomorphic: fetch API works everywhere
    const response = await fetch('/api/users')
    if (!response.ok) {
      throw new Error('Failed to fetch users')
    }
    
    return response.json()
  }
})
```

### Isomorphic Utilities

Write utilities that work in both environments:

```tsx
// utils/validation.ts

// ✅ Isomorphic: Pure validation functions
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export function formatCurrency(
  amount: number,
  currency: string = 'USD'
): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(amount)
}

// ✅ Isomorphic: Date utilities
export function getRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  return date.toLocaleDateString()
}
```

---

## Practical Patterns

### Conditional Imports

Use dynamic imports for environment-specific code:

```tsx
// utils/conditional-imports.ts

// ✅ Server-only imports
export async function getServerAnalytics() {
  if (typeof window !== 'undefined') {
    throw new Error('Server-only function')
  }
  
  // ✅ Dynamic import prevents client bundling
  const { Analytics } = await import('./server-analytics')
  return new Analytics()
}

// ✅ Client-only imports
export async function getClientAnalytics() {
  if (typeof window === 'undefined') {
    throw new Error('Client-only function')
  }
  
  // ✅ Dynamic import prevents server execution
  const { GoogleAnalytics } = await import('./client-analytics')
  return new GoogleAnalytics()
}
```

### Isomorphic State Management

Handle state that needs to work everywhere:

```tsx
// hooks/useIsomorphicState.ts
import { useState, useEffect } from 'react'

export function useIsomorphicState<T>(
  initialValue: T,
  storageKey?: string
) {
  const [value, setValue] = useState<T>(initialValue)
  const [isHydrated, setIsHydrated] = useState(false)

  useEffect(() => {
    setIsHydrated(true)
    
    // ✅ Only access localStorage after hydration
    if (storageKey && typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        try {
          setValue(JSON.parse(stored))
        } catch {
          // Invalid JSON, keep initial value
        }
      }
    }
  }, [storageKey])

  useEffect(() => {
    // ✅ Only save to localStorage on client
    if (isHydrated && storageKey && typeof localStorage !== 'undefined') {
      localStorage.setItem(storageKey, JSON.stringify(value))
    }
  }, [value, storageKey, isHydrated])

  return [value, setValue, isHydrated] as const
}
```

### Environment-Aware Utilities

Create utilities that work optimally in each environment:

```tsx
// utils/environment-aware.ts
import { 
  createIsomorphicFn, 
  serverOnly, 
  clientOnly 
} from '@tanstack/react-start'

// ✅ Logging with different outputs per environment
export const logger = createIsomorphicFn()
  .server((message: string, level: string = 'info') => {
    // Server: Write to file and console
    console.log(`[${level.toUpperCase()}]: ${message}`)
    serverOnly(() => {
      const fs = require('node:fs')
      fs.appendFileSync('app.log', `${new Date()}: ${message}\n`)
    })()
  })
  .client((message: string, level: string = 'info') => {
    // Client: Console and analytics
    console.log(`[${level.toUpperCase()}]: ${message}`)
    clientOnly(() => {
      if (window.gtag) {
        window.gtag('event', 'log', { level, message })
      }
    })()
  })

// ✅ Performance monitoring per environment  
export const startTimer = createIsomorphicFn()
  .server((label: string) => {
    console.time(label)
    return () => console.timeEnd(label)
  })
  .client((label: string) => {
    const start = performance.now()
    return () => {
      const duration = performance.now() - start
      console.log(`${label}: ${duration.toFixed(2)}ms`)
    }
  })

// ✅ Storage with fallbacks
export const storage = {
  get: createIsomorphicFn()
    .server((key: string) => {
      // Server: Use file-based storage
      return serverOnly(() => {
        const fs = require('node:fs')
        try {
          const data = fs.readFileSync('.cache', 'utf-8')
          return JSON.parse(data)[key]
        } catch {
          return null
        }
      })()
    })
    .client((key: string) => {
      // Client: Use localStorage
      return clientOnly(() => {
        try {
          return JSON.parse(localStorage.getItem(key) || 'null')
        } catch {
          return null
        }
      })()
    }),
    
  set: createIsomorphicFn()
    .server((key: string, value: any) => {
      return serverOnly(() => {
        const fs = require('node:fs')
        let cache = {}
        try {
          cache = JSON.parse(fs.readFileSync('.cache', 'utf-8'))
        } catch {}
        cache[key] = value
        fs.writeFileSync('.cache', JSON.stringify(cache))
      })()
    })
    .client((key: string, value: any) => {
      return clientOnly(() => {
        localStorage.setItem(key, JSON.stringify(value))
      })()
    })
}
```

### Server Function with Client Integration

Combine server functions with client-side logic:

```tsx
// features/user-profile.tsx
import { createServerFn } from '@tanstack/react-start'
import { useState } from 'react'

// ✅ Server-only: Database operations
const updateUserProfile = createServerFn({ method: 'POST' })
  .validator((data: { name: string; email: string }) => data)
  .handler(async ({ data }) => {
    // Server-only database update
    const db = await import('./database')
    return db.users.update(data)
  })

// ✅ Client component with server function integration
export function UserProfileForm({ initialProfile }: { initialProfile: any }) {
  const [profile, setProfile] = useState(initialProfile)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    
    try {
      // ✅ Call server function from client
      await updateUserProfile({ data: profile })
      setLastSaved(new Date())
      
      // ✅ Client-only: Show success notification
      if (typeof window !== 'undefined' && 'Notification' in window) {
        new Notification('Profile updated successfully!')
      }
    } catch (error) {
      console.error('Failed to update profile:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving...' : 'Save Profile'}
      </button>
      
      {lastSaved && (
        <p>Last saved: {lastSaved.toLocaleTimeString()}</p>
      )}
    </form>
  )
}
```

---

## Common Problems

### Hydration Mismatches

**Problem**: Server and client render different content.

```tsx
// ❌ Causes hydration mismatch
function BadExample() {
  return <div>{new Date().toLocaleString()}</div>
}

// ✅ Avoid hydration mismatch
function GoodExample() {
  const [clientDate, setClientDate] = useState<string>('')

  useEffect(() => {
    setClientDate(new Date().toLocaleString())
  }, [])

  return (
    <div>
      {clientDate || 'Loading current time...'}
    </div>
  )
}
```

### Accessing Browser APIs on Server

**Problem**: Using `window`, `document`, or other browser APIs during SSR.

```tsx
// ❌ Crashes during SSR
function BadExample() {
  const width = window.innerWidth // ReferenceError on server
  return <div>Width: {width}</div>
}

// ✅ Safe browser API access
function GoodExample() {
  const [width, setWidth] = useState(0)

  useEffect(() => {
    setWidth(window.innerWidth)
    
    const handleResize = () => setWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return <div>Width: {width || 'Unknown'}</div>
}
```

### Server-Only Dependencies in Client Bundle

**Problem**: Server dependencies being included in client bundle.

```tsx
// ❌ Imports server dependency in client
import fs from 'node:fs'

function BadExample() {
  if (typeof window === 'undefined') {
    return fs.readFileSync('config.json', 'utf-8')
  }
  return 'No config on client'
}

// ✅ Use dynamic imports or server functions
const getConfig = createServerFn().handler(async () => {
  const fs = await import('node:fs/promises')
  const config = await fs.readFile('config.json', 'utf-8')
  return JSON.parse(config)
})
```

### Environment Variable Leakage

**Problem**: Server-only environment variables being exposed to client.

```tsx
// ❌ Exposes secret to client bundle
const API_KEY = process.env.SECRET_API_KEY

// ✅ Keep secrets server-only with serverOnly()
const getApiKey = serverOnly(() => process.env.SECRET_API_KEY)

// ✅ Keep secrets server-only with createServerFn()
const getApiData = createServerFn().handler(async () => {
  const apiKey = process.env.SECRET_API_KEY
  const response = await fetch('https://api.example.com/data', {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  return response.json()
})
```

### Incorrect API Usage

**Problem**: Using execution boundary APIs incorrectly.

```tsx
// ❌ Calling clientOnly function on server will throw
const badExample = () => {
  const data = clientOnly(() => localStorage.getItem('key'))()
  // This crashes during SSR
}

// ✅ Use conditional execution or ClientOnly component
const goodExample = () => {
  const [data, setData] = useState(null)
  
  useEffect(() => {
    const getData = clientOnly(() => localStorage.getItem('key'))
    setData(getData())
  }, [])
  
  return data
}

// ❌ Missing client implementation
const incomplete = createIsomorphicFn()
  .server(() => 'server only')
  // No .client() - becomes no-op on client

// ✅ Provide both implementations when needed
const complete = createIsomorphicFn()
  .server(() => 'server implementation')
  .client(() => 'client implementation')
```

### ClientOnly Component Misuse

**Problem**: Not providing appropriate fallbacks or using incorrectly.

```tsx
// ❌ No fallback causes layout shift
<ClientOnly>
  <ExpensiveComponent />
</ClientOnly>

// ✅ Provide fallback that matches layout
<ClientOnly fallback={<ComponentSkeleton />}>
  <ExpensiveComponent />
</ClientOnly>

// ❌ Using ClientOnly for simple conditional rendering
<ClientOnly>
  {isLoggedIn ? <UserMenu /> : <LoginButton />}
</ClientOnly>

// ✅ Use useState and useEffect for conditional logic
const [isClient, setIsClient] = useState(false)
useEffect(() => setIsClient(true), [])

return isClient ? (
  isLoggedIn ? <UserMenu /> : <LoginButton />
) : (
  <MenuSkeleton />
)
```

---

## Production Checklist

### Development vs Production Behavior

- [ ] **Test SSR rendering**: Ensure server rendering works without browser APIs
- [ ] **Verify hydration**: Check that client-side hydration doesn't cause mismatches
- [ ] **Bundle analysis**: Confirm server-only dependencies aren't in client bundle
- [ ] **Environment variables**: Ensure secrets are only accessible server-side
- [ ] **Error boundaries**: Handle server/client execution errors gracefully

### Performance Considerations

- [ ] **Code splitting**: Use dynamic imports for environment-specific code
- [ ] **Server function optimization**: Minimize server function payload size
- [ ] **Client-side caching**: Cache client-only computations appropriately
- [ ] **Isomorphic utilities**: Prefer lightweight, framework-agnostic utilities

---

## Related Resources

- [TanStack Start Server Functions Guide](../server-functions.md)
- [TanStack Start Middleware Guide](../middleware.md)
- [TanStack Router SSR Guide](../../../router/framework/react/how-to/setup-ssr.md)

<!-- Next Steps (commented until guides exist)
- [How to Create Basic Server Functions](./create-basic-server-functions.md)
- [How to Write Type-Safe Server Functions](./write-type-safe-server-functions.md)
- [How to Use Server Function Middleware](./use-server-function-middleware.md)
-->