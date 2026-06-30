# Redirects

Programmatic navigation from loaders and guards.

## Basic Redirect

```tsx
import { redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/old-path')({
  beforeLoad: () => {
    throw redirect({ to: '/new-path' })
  },
})
```

## Redirect with Params

```tsx
throw redirect({
  to: '/posts/$postId',
  params: { postId: '123' },
  search: { tab: 'comments' },
})
```

## Conditional Redirect

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    const post = await fetchPost(params.postId)

    // Redirect to canonical slug
    if (post.slug !== params.postId) {
      throw redirect({
        to: '/posts/$postId',
        params: { postId: post.slug },
      })
    }

    return post
  },
})
```

## Redirect Status Codes

```tsx
// Temporary redirect (302)
throw redirect({ to: '/temp', statusCode: 302 })

// Permanent redirect (301)
throw redirect({ to: '/new', statusCode: 301 })
```

## Redirect from Loader vs beforeLoad

```tsx
export const Route = createFileRoute('/dashboard')({
  // beforeLoad runs first, before loader
  beforeLoad: async ({ context }) => {
    // Good for auth checks
    if (!context.auth.user) {
      throw redirect({ to: '/login' })
    }
  },
  // loader runs after beforeLoad
  loader: async ({ context }) => {
    // Good for data-dependent redirects
    const data = await fetchDashboard()
    if (data.needsOnboarding) {
      throw redirect({ to: '/onboarding' })
    }
    return data
  },
})
```

## External Redirects

```tsx
export const Route = createFileRoute('/external')({
  beforeLoad: () => {
    window.location.href = 'https://external-site.com'
    // Throw to prevent render
    throw new Error('Redirecting...')
  },
})
```

## Replace History

```tsx
throw redirect({
  to: '/new-path',
  replace: true, // Don't add to history
})
```
