# TanStack Router - Hydrate Feature Demo

This demo showcases the new `hydrate` option for TanStack Start routes, which allows you to create server-rendered pages without client-side React hydration.

## What is `hydrate: false`?

The `hydrate` option controls whether a route should include the React hydration bundle and become interactive on the client. When set to `false`:

- ✅ Page is fully server-side rendered
- ✅ All content is SEO-friendly
- ✅ Fast initial page load (no JavaScript bundle)
- ❌ No React interactivity (no state, effects, or event handlers)
- ❌ Navigation uses traditional full-page reloads

## Running the Demo

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Build and Start the Server

```bash
pnpm build
pnpm start
```

### 3. Open in Browser

Navigate to `http://localhost:3000`

## Demo Routes

### Home Page (`/`)
- Overview of the feature
- Links to comparison pages

### Hydrated Route (`/hydrated`)
- **Normal React route** with full interactivity
- Includes React bundle and hydration
- Features:
  - Interactive counter with state
  - Effect hooks that run on mount
  - Full React functionality

### Static Route (`/static`)
- **Server-rendered static page** with `hydrate: false`
- No React bundle loaded
- Features:
  - Server-side rendered content
  - Loader data still works
  - No client-side interactivity
  - Demonstrates what doesn't work without hydration

## Code Example

### Hydrated Route (Default)

```typescript
export const Route = createFileRoute('/hydrated')({
  // hydrate: true is the default (can be omitted)
  loader: () => ({ message: 'Server data' }),
  component: MyComponent,
})
```

### Static Route

```typescript
export const Route = createFileRoute('/static')({
  hydrate: false, // 🔑 This is the key option
  loader: () => ({ message: 'Server data' }),
  component: MyStaticComponent,
})
```

## Inspecting the Difference

### Open DevTools → Network Tab

1. Visit `/hydrated` and filter by "JS"
   - You'll see: React, React DOM, Router bundles, and app code
   - Look for hydration data in the HTML (`window.$_TSR`)

2. Visit `/static` and filter by "JS"
   - You'll see: NO application bundles
   - NO hydration data in the HTML
   - Only external scripts you explicitly added

### Check Page Source

**Hydrated Route:**
```html
<script type="module" src="/assets/client-*.js"></script>
<script>window.$_TSR = {...}</script>
```

**Static Route:**
```html
<!-- No application scripts! -->
```

## Use Cases

Perfect for:
- 📄 Legal pages (Terms, Privacy Policy)
- 📝 Blog posts and articles
- 🎯 Marketing landing pages
- 📚 Documentation
- 🔍 SEO-focused content pages
- ⚡ When you want minimal JavaScript

## Advanced Features

### Inheritance
If a parent route has `hydrate: false`, all child routes inherit it unless explicitly overridden.

### Dynamic Hydration
You can use a function to determine hydration dynamically:

```typescript
export const Route = createFileRoute('/dynamic')({
  hydrate: ({ search, params }) => {
    // Conditionally hydrate based on query params or other factors
    return search.interactive === 'true'
  },
  component: MyComponent,
})
```

### Conflict Warning
If conflicting `hydrate` settings exist in the route tree (some true, some false), the page will hydrate and log a warning to help you debug.

## Running Tests

```bash
pnpm test:e2e
```

The E2E tests verify:
- Main bundle scripts are excluded when `hydrate: false`
- Serialized data is excluded
- External scripts still work
- Server-rendered content is correct
- Meta tags are properly rendered

## Learn More

- [TanStack Router Documentation](https://tanstack.com/router)
- [TanStack Start Documentation](https://tanstack.com/router/latest/docs/framework/react/start)
