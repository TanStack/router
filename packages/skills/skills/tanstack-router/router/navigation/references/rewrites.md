# URL Rewrites

Transform URLs without changing the visible address.

## Basic Rewrite

```tsx
export const Route = createFileRoute('/old-path')({
  beforeLoad: () => {
    // Internally load /new-path but keep /old-path in URL
    return {
      rewrite: '/new-path',
    }
  },
})
```

## Rewrite vs Redirect

| Rewrite                 | Redirect           |
| ----------------------- | ------------------ |
| URL stays the same      | URL changes        |
| Internal routing change | Browser navigation |
| SEO: same URL           | SEO: new URL       |
| User sees original URL  | User sees new URL  |

## Legacy URL Support

```tsx
// Support old URL structure
export const Route = createFileRoute('/blog/$slug')({
  beforeLoad: ({ params }) => {
    // Old: /blog/my-post
    // New: /posts/my-post
    // Keep /blog/my-post visible but load /posts content
  },
  loader: async ({ params }) => {
    // Load from new location
    return fetchPost(params.slug)
  },
})
```

## Conditional Rewrites

```tsx
export const Route = createFileRoute('/products/$id')({
  beforeLoad: async ({ params }) => {
    const product = await getProductType(params.id)

    // Rewrite based on product type
    if (product.type === 'digital') {
      return { rewrite: `/digital-products/${params.id}` }
    }
    if (product.type === 'physical') {
      return { rewrite: `/physical-products/${params.id}` }
    }
  },
})
```

## A/B Testing with Rewrites

```tsx
export const Route = createFileRoute('/landing')({
  beforeLoad: ({ context }) => {
    const variant = context.abTest.getVariant('landing-page')

    return {
      rewrite: `/landing-${variant}`, // /landing-a or /landing-b
    }
  },
})
```

## Rewrite with Params

```tsx
export const Route = createFileRoute('/u/$username')({
  beforeLoad: ({ params }) => {
    // Short URL /u/john rewrites to /users/john/profile
    return {
      rewrite: `/users/${params.username}/profile`,
    }
  },
})
```

## When to Use Rewrites

- **Legacy URL support**: Keep old URLs working
- **URL shortening**: Short public URLs, longer internal routes
- **A/B testing**: Same URL, different content
- **Multi-tenant**: Same route, tenant-specific content
