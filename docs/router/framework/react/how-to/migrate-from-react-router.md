---
title: How to Migrate from React Router v6
---

# How to Migrate from React Router v6

This guide provides a step-by-step process to migrate your application from React Router v6 to TanStack Router. We'll cover the complete migration process from removing React Router dependencies to implementing TanStack Router's type-safe routing patterns.

## Quick Start

**Time Required:** 2-4 hours depending on app complexity  
**Difficulty:** Intermediate  
**Prerequisites:** Basic React knowledge, existing React Router v6 app

### What You'll Accomplish

- Remove React Router v6 dependencies and components
- Install and configure TanStack Router
- Convert route definitions to file-based routing
- Update navigation components and hooks
- Implement type-safe routing patterns
- Handle search params and dynamic routes

---

## Complete Migration Process

### Step 1: Prepare for Migration

Before making any changes, prepare your environment and codebase:

**1.1 Create a backup branch**

```bash
git checkout -b migrate-to-tanstack-router
git push -u origin migrate-to-tanstack-router
```

**1.2 Install TanStack Router (keep React Router temporarily)**

```bash
# Install TanStack Router
npm install @tanstack/react-router

# Install development dependencies
npm install -D @tanstack/router-plugin @tanstack/react-router-devtools
```

**1.3 Set up the router plugin for your bundler**

For **Vite** users, update your `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter(), // Add this before react plugin
    react(),
  ],
})
```

For **other bundlers**, see our [bundler configuration guides](../routing/).

### Step 2: Create TanStack Router Configuration

**2.1 Create router configuration file**

Create `tsr.config.json` in your project root:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts",
  "quoteStyle": "single"
}
```

**2.2 Create routes directory**

```bash
mkdir src/routes
```

### Step 3: Convert Your Route Structure

**3.1 Identify your current React Router structure**

Examine your existing React Router setup. Look for:

- `createBrowserRouter` or `BrowserRouter` usage
- `Routes` and `Route` components
- Nested route patterns
- Dynamic route segments
- Layout components

**3.2 Create root route**

Create `src/routes/__root.tsx`:

```typescript
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      {/* Your existing layout/navbar content */}
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

**3.3 Create index route**

Create `src/routes/index.tsx` for your home page:

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}
```

**3.4 Convert static routes**

For each static route in React Router like `/about`, create corresponding files:

**React Router v6:**

```typescript
// In your router config
{
  path: "/about",
  element: <About />
}
```

**TanStack Router equivalent:**
Create `src/routes/about.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

function About() {
  return <div className="p-2">Hello from About!</div>
}
```

**3.5 Convert dynamic routes**

**React Router v6:**

```typescript
// Route definition
{
  path: "/posts/:postId",
  element: <Post />
}

// Component usage
import { useParams } from 'react-router-dom'

function Post() {
  const { postId } = useParams()
  return <div>Post {postId}</div>
}
```

**TanStack Router equivalent:**
Create `src/routes/posts/$postId.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: Post,
})

function Post() {
  const { postId } = Route.useParams()
  return <div className="p-2">Post {postId}</div>
}
```

**3.6 Convert nested routes**

**React Router v6:**

```typescript
{
  path: "/posts",
  element: <PostsLayout />,
  children: [
    {
      index: true,
      element: <PostsIndex />
    },
    {
      path: ":postId",
      element: <Post />
    }
  ]
}
```

**TanStack Router equivalent:**
Create `src/routes/posts.tsx` (layout):

```typescript
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: PostsLayout,
})

function PostsLayout() {
  return (
    <div className="p-2">
      <div className="flex gap-2">
        <Link to="/posts" className="[&.active]:font-bold">
          Posts
        </Link>
        <Link to="/posts/$postId" params={{ postId: 'new' }}>
          New Post
        </Link>
      </div>
      <hr />
      <Outlet />
    </div>
  )
}
```

Create `src/routes/posts/index.tsx`:

```typescript
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndex,
})

function PostsIndex() {
  return <div>Select a post</div>
}
```

### Step 4: Update Your Main Router

**4.1 Create router instance**

Create `src/router.tsx`:

```typescript
import { createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

export { router }
```

**4.2 Update your main app file**

Replace your React Router setup in `src/main.tsx` or `src/App.tsx`:

**Before (React Router v6):**

```typescript
import { RouterProvider, createBrowserRouter } from 'react-router-dom'

const router = createBrowserRouter([
  // Your route definitions
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
```

**After (TanStack Router):**

```typescript
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
```

### Step 5: Update Navigation Components

**5.1 Update Link components**

**React Router v6:**

```typescript
import { Link } from 'react-router-dom'

<Link to="/posts/123">View Post</Link>
<Link to="/posts" state={{ from: 'home' }}>Posts</Link>
```

**TanStack Router:**

```typescript
import { Link } from '@tanstack/react-router'

<Link to="/posts/$postId" params={{ postId: '123' }}>View Post</Link>
<Link to="/posts" state={{ from: 'home' }}>Posts</Link>
```

**5.2 Update imperative navigation**

**React Router v6:**

```typescript
import { useNavigate } from 'react-router-dom'

function Component() {
  const navigate = useNavigate()

  const handleClick = () => {
    navigate('/posts/123')
    // or
    navigate('/posts', { state: { from: 'home' } })
  }
}
```

**TanStack Router:**

```typescript
import { useNavigate } from '@tanstack/react-router'

function Component() {
  const navigate = useNavigate({ from: '/posts' })

  const handleClick = () => {
    navigate({ to: '/posts/$postId', params: { postId: '123' } })
    // or
    navigate({ to: '/posts', state: { from: 'home' } })
  }
}
```

### Step 6: Handle Search Parameters

**6.1 Basic search params migration**

**React Router v6:**

```typescript
import { useSearchParams } from 'react-router-dom'

function Component() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = searchParams.get('page') || '1'

  const updatePage = (newPage: string) => {
    setSearchParams({ page: newPage })
  }
}
```

**TanStack Router:**
First, define search params validation in your route:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const searchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().optional(),
})

export const Route = createFileRoute('/posts')({
  validateSearch: searchSchema,
  component: Posts,
})

function Posts() {
  const navigate = useNavigate({ from: '/posts' })
  const { page, filter } = Route.useSearch()

  const updatePage = (newPage: number) => {
    navigate({ search: (prev) => ({ ...prev, page: newPage }) })
  }
}
```

### Step 7: Remove React Router Dependencies

Only after everything is working with TanStack Router:

**7.1 Remove React Router**

```bash
npm uninstall react-router-dom @types/react-router-dom
```

**7.2 Clean up unused imports**

Search your codebase for any remaining React Router imports:

```bash
# Find remaining React Router imports
grep -r "react-router" src/
grep -r "react-router-dom" src/
```

Remove any remaining imports and replace with TanStack Router equivalents.

### Step 8: Add Type Safety (Optional but Recommended)

**8.1 Enable strict TypeScript**

Update your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true
  }
}
```

**8.2 Add search parameter validation**

For routes with search parameters, add validation schemas:

```typescript
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const postsSearchSchema = z.object({
  page: z.number().min(1).catch(1),
  search: z.string().optional(),
  category: z.enum(['tech', 'business', 'lifestyle']).optional(),
})

export const Route = createFileRoute('/posts')({
  validateSearch: postsSearchSchema,
  component: Posts,
})
```

---

## Production Checklist

Before deploying your migrated application:

### Router Configuration

- [ ] Router instance created and properly exported
- [ ] Route tree generated successfully
- [ ] TypeScript declarations registered
- [ ] All route files follow naming conventions

### Route Migration

- [ ] All static routes converted to file-based routing
- [ ] Dynamic routes updated with proper parameter syntax
- [ ] Nested routes maintain hierarchy
- [ ] Index routes created where needed
- [ ] Layout routes preserve component structure

### Navigation Updates

- [ ] All Link components updated to TanStack Router
- [ ] useNavigate hooks replaced and tested
- [ ] Navigation parameters properly typed
- [ ] Search parameter validation implemented

### Code Cleanup

- [ ] React Router dependencies removed
- [ ] Unused imports cleaned up
- [ ] No React Router references remain
- [ ] TypeScript compilation successful
- [ ] All tests passing

### Testing

- [ ] All routes accessible and rendering correctly
- [ ] Navigation between routes working
- [ ] Back/forward browser buttons functional
- [ ] Search parameters persisting correctly
- [ ] Dynamic routes with parameters working
- [ ] Nested route layouts displaying properly

---

## Common Problems

### Error: "Cannot use useNavigate outside of context"

**Problem:** You have remaining React Router imports that conflict with TanStack Router.

**Solution:**

1. Search for all React Router imports:
   ```bash
   grep -r "react-router" src/
   ```
2. Replace all imports with TanStack Router equivalents
3. Ensure React Router is completely uninstalled

### TypeScript Errors: Route Parameters

**Problem:** TypeScript showing errors about route parameters not being typed correctly.

**Solution:**

1. Ensure your router is registered in the TypeScript module declaration:
   ```typescript
   declare module '@tanstack/react-router' {
     interface Register {
       router: typeof router
     }
   }
   ```
2. Check that your route files export the Route correctly
3. Verify parameter names match between route definition and usage

### Routes Not Matching

**Problem:** Routes not rendering or 404 errors for valid routes.

**Solution:**

1. Check file naming follows TanStack Router conventions:
   - Dynamic routes: `$paramName.tsx`
   - Index routes: `index.tsx`
   - Nested routes: proper directory structure
2. Verify route tree generation is working
3. Check that the router plugin is properly configured

### Search Parameters Not Working

**Problem:** Search parameters not being read or updated correctly.

**Solution:**

1. Add search parameter validation to your route:
   ```typescript
   export const Route = createFileRoute('/posts')({
     validateSearch: (search) => ({
       page: Number(search.page) || 1,
       filter: search.filter || '',
     }),
     component: Posts,
   })
   ```
2. Use `Route.useSearch()` instead of React Router's `useSearchParams`
3. Update search params with navigation functions

### Build Errors After Migration

**Problem:** Application builds successfully but has runtime errors.

**Solution:**

1. Clear your build cache:
   ```bash
   rm -rf node_modules/.cache
   rm -rf dist
   npm run build
   ```
2. Ensure the route tree file is being generated correctly
3. Check that all route files are exporting Route properly

### Performance Issues

**Problem:** Application feels slower after migration.

**Solution:**

1. Enable code splitting with lazy routes:

   ```typescript
   import { createLazyFileRoute } from '@tanstack/react-router'

   export const Route = createLazyFileRoute('/posts/$postId')({
     component: Post,
   })
   ```

2. Configure route preloading:
   ```typescript
   const router = createRouter({
     routeTree,
     defaultPreload: 'intent',
   })
   ```

---

## Common Next Steps

After successfully migrating to TanStack Router, consider these enhancements:

<!--
Uncomment as guides become available:

- [Set up authentication and protected routes](./setup-authentication.md) - Add route-based auth patterns
- [Handle search parameters and URL state](./handle-search-parameters.md) - Advanced search param patterns
- [Set up testing with TanStack Router](./setup-testing.md) - Test your migrated routes
- [Debug common router issues](./debug-router-issues.md) - Troubleshoot navigation problems
-->

### Advanced Features to Explore

- **Route-based code splitting** - Improve performance with lazy loading
- **Search parameter validation** - Type-safe URL state management
- **Route preloading** - Enhance perceived performance
- **Route masking** - Advanced URL management
- **SSR setup** - Server-side rendering capabilities

---

## Related Resources

- [Migration from React Router (Basic Guide)](../migrate-from-react-router.md) - Original checklist-style guide
- [File-Based Routing Guide](../routing/file-based-routing.md) - Detailed routing concepts
- [Navigation Guide](../guide/navigation.md) - Complete navigation patterns
- [Search Parameters Guide](../guide/search-params.md) - Advanced search param usage
- [Type Safety Guide](../guide/type-safety.md) - TypeScript integration details
- [TanStack Router Comparison](../comparison.md) - Feature comparison with other routers
