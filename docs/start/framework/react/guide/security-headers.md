---
id: security-headers
title: Security Headers
---

This guide covers how to implement security headers in TanStack Start using request middleware, server routes, and the server entry point.

## Overview

Security headers protect your application against common web vulnerabilities. TanStack Start provides several approaches for setting headers:

- **Global request middleware** applies headers to all responses (SSR, server functions, server routes)
- **Server route handlers** set headers for specific API endpoints
- **Per-route middleware** applies headers to specific routes

## Global Security Headers with Middleware

The most comprehensive approach is using global request middleware in your `src/start.ts` file. This ensures headers are applied to every response.

```tsx
// src/start.ts
import { createStart, createMiddleware } from '@tanstack/react-start'

const securityHeadersMiddleware = createMiddleware().server(
  async ({ next }) => {
    const result = await next()

    // Apply security headers to the response
    result.response.headers.set(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'",
    )
    result.response.headers.set('X-Frame-Options', 'DENY')
    result.response.headers.set('X-Content-Type-Options', 'nosniff')
    result.response.headers.set(
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    )
    result.response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    )
    result.response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=()',
    )

    return result
  },
)

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware],
}))
```

## Content-Security-Policy (CSP)

CSP prevents cross-site scripting (XSS) attacks by controlling which resources can be loaded.

### Basic CSP Configuration

```tsx
// src/middleware/security.ts
import { createMiddleware } from '@tanstack/react-start'

const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
}

function buildCspHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')
}

export const cspMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  result.response.headers.set(
    'Content-Security-Policy',
    buildCspHeader(cspDirectives),
  )

  return result
})
```

### CSP with Nonce for Inline Scripts

When you need inline scripts (common with SSR hydration), use nonces to allow specific scripts while blocking others.

```tsx
// src/middleware/csp-nonce.ts
import { createMiddleware } from '@tanstack/react-start'
import { randomBytes } from 'crypto'

export const cspNonceMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    // Generate a unique nonce for this request
    const nonce = randomBytes(16).toString('base64')

    // Store nonce in context for use in components
    const result = await next({
      context: { cspNonce: nonce },
    })

    // Build CSP with nonce
    const csp = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
    ].join('; ')

    result.response.headers.set('Content-Security-Policy', csp)

    return result
  },
)
```

To use the nonce in your scripts, access it from the router context:

```tsx
// routes/__root.tsx
import { createRootRouteWithContext } from '@tanstack/react-router'

type RouterContext = {
  cspNonce?: string
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: ({ context }) => ({
    scripts: context.cspNonce
      ? [
          {
            nonce: context.cspNonce,
            children: `console.log('Inline script with nonce')`,
          },
        ]
      : [],
  }),
  component: RootComponent,
})
```

### Development vs Production CSP

You may need different policies for development (looser) and production (strict):

```tsx
// src/middleware/security.ts
import { createMiddleware } from '@tanstack/react-start'

const isDev = process.env.NODE_ENV === 'development'

const cspDirectives = isDev
  ? {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // Needed for HMR
      'style-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'", 'ws:', 'wss:'], // WebSocket for HMR
    }
  : {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'connect-src': ["'self'"],
      'frame-ancestors': ["'none'"],
    }

export const cspMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()

  const cspHeader = Object.entries(cspDirectives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ')

  result.response.headers.set('Content-Security-Policy', cspHeader)

  return result
})
```

## Other Security Headers

### X-Frame-Options

Prevents clickjacking by controlling whether your page can be embedded in iframes:

```tsx
// 'DENY' - Never allow framing
result.response.headers.set('X-Frame-Options', 'DENY')

// 'SAMEORIGIN' - Allow framing only from same origin
result.response.headers.set('X-Frame-Options', 'SAMEORIGIN')
```

### X-Content-Type-Options

Prevents MIME type sniffing:

```tsx
result.response.headers.set('X-Content-Type-Options', 'nosniff')
```

### Strict-Transport-Security (HSTS)

Forces HTTPS connections:

```tsx
// 1 year, include subdomains, allow preload list
result.response.headers.set(
  'Strict-Transport-Security',
  'max-age=31536000; includeSubDomains; preload',
)
```

### Referrer-Policy

Controls what information is sent in the Referer header:

```tsx
result.response.headers.set(
  'Referrer-Policy',
  'strict-origin-when-cross-origin',
)
```

### Permissions-Policy

Controls browser features your site can use:

```tsx
result.response.headers.set(
  'Permissions-Policy',
  'camera=(), microphone=(), geolocation=(), payment=()',
)
```

## CORS Headers for API Routes

For server routes that serve as APIs, you may need CORS headers:

```tsx
// src/middleware/cors.ts
import { createMiddleware } from '@tanstack/react-start'

const allowedOrigins = ['https://example.com', 'https://app.example.com']

export const corsMiddleware = createMiddleware().server(
  async ({ next, request }) => {
    const origin = request.headers.get('origin')

    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const headers = new Headers()
      if (origin && allowedOrigins.includes(origin)) {
        headers.set('Access-Control-Allow-Origin', origin)
        headers.set(
          'Access-Control-Allow-Methods',
          'GET, POST, PUT, DELETE, OPTIONS',
        )
        headers.set(
          'Access-Control-Allow-Headers',
          'Content-Type, Authorization',
        )
        headers.set('Access-Control-Max-Age', '86400')
      }
      return { response: new Response(null, { status: 204, headers }) }
    }

    const result = await next()

    // Set CORS headers on actual requests
    if (origin && allowedOrigins.includes(origin)) {
      result.response.headers.set('Access-Control-Allow-Origin', origin)
      result.response.headers.set('Access-Control-Allow-Credentials', 'true')
    }

    return result
  },
)
```

### Apply CORS to Specific Routes

Use the CORS middleware only on API routes that need it:

```tsx
// routes/api/data.ts
import { createFileRoute } from '@tanstack/react-router'
import { corsMiddleware } from '../../middleware/cors'

export const Route = createFileRoute('/api/data')({
  server: {
    middleware: [corsMiddleware],
    handlers: {
      GET: async () => {
        return Response.json({ data: 'example' })
      },
    },
  },
})
```

## Complete Security Middleware Example

Here is a production-ready security middleware that combines all recommended headers:

```tsx
// src/middleware/security.ts
import { createMiddleware } from '@tanstack/react-start'
import { randomBytes } from 'crypto'

type SecurityContext = {
  cspNonce: string
}

export const securityMiddleware = createMiddleware().server(
  async ({ next }) => {
    const nonce = randomBytes(16).toString('base64')

    const result = await next({
      context: { cspNonce: nonce },
    })

    const isProduction = process.env.NODE_ENV === 'production'

    // Content-Security-Policy
    const cspDirectives = [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ]
    result.response.headers.set(
      'Content-Security-Policy',
      cspDirectives.join('; '),
    )

    // Prevent clickjacking
    result.response.headers.set('X-Frame-Options', 'DENY')

    // Prevent MIME type sniffing
    result.response.headers.set('X-Content-Type-Options', 'nosniff')

    // Control referrer information
    result.response.headers.set(
      'Referrer-Policy',
      'strict-origin-when-cross-origin',
    )

    // HSTS (production only to avoid local dev issues)
    if (isProduction) {
      result.response.headers.set(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      )
    }

    // Disable unnecessary browser features
    result.response.headers.set(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=()',
    )

    return result
  },
)
```

```tsx
// src/start.ts
import { createStart } from '@tanstack/react-start'
import { securityMiddleware } from './middleware/security'

export const startInstance = createStart(() => ({
  requestMiddleware: [securityMiddleware],
}))
```

## Per-Route Header Customization

Sometimes you need different headers for specific routes. Use route-level middleware:

```tsx
// routes/embed.tsx
import { createFileRoute } from '@tanstack/react-router'
import { createMiddleware } from '@tanstack/react-start'

// Allow this specific page to be embedded
const allowEmbedMiddleware = createMiddleware().server(async ({ next }) => {
  const result = await next()
  result.response.headers.set('X-Frame-Options', 'SAMEORIGIN')
  return result
})

export const Route = createFileRoute('/embed')({
  server: {
    middleware: [allowEmbedMiddleware],
  },
  component: EmbeddableWidget,
})
```

## Setting Headers in Server Routes

For API routes, set headers directly in the handler:

```tsx
// routes/api/public.ts
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/api/public')({
  server: {
    handlers: {
      GET: async () => {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
            'Access-Control-Allow-Origin': '*',
          },
        })
      },
    },
  },
})
```

## Testing Your Security Headers

Use these tools to verify your security header configuration:

- [SecurityHeaders.com](https://securityheaders.com) for overall security header analysis
- [CSP Evaluator](https://csp-evaluator.withgoogle.com) for CSP policy review
- Browser DevTools Network tab to inspect response headers

## Related Resources

- [Middleware](./middleware) for detailed middleware patterns
- [Server Routes](./server-routes) for API endpoint configuration
- [Server Entry Point](./server-entry-point) for server customization
