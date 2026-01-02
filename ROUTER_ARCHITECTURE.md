# TanStack Router Architecture Overview

A comprehensive, step-by-step guide to understanding how TanStack Router works internally.

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Initialization Flow](#initialization-flow)
3. [Route Tree Processing](#route-tree-processing)
4. [Navigation Flow](#navigation-flow)
5. [Route Matching](#route-matching)
6. [Data Loading Pipeline](#data-loading-pipeline)
7. [State Management](#state-management)
8. [Caching Strategy](#caching-strategy)

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  (React/Solid/Vue Components using Router)                 │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│              Framework Adapter Layer                         │
│  @tanstack/react-router | @tanstack/solid-router           │
│  - RouterProvider                                           │
│  - Link, Outlet, useNavigate, etc.                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                  Router Core Layer                           │
│  @tanstack/router-core                                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  RouterCore Class                                     │  │
│  │  - State Management (Store)                          │  │
│  │  - Route Matching                                     │  │
│  │  - Navigation                                         │  │
│  │  - Data Loading                                      │  │
│  │  - Caching                                           │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Route Tree Processing                                 │  │
│  │  - Segment Trie Construction                          │  │
│  │  - Route Indexing (by ID, by Path)                   │  │
│  └──────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  History Management                                   │  │
│  │  @tanstack/history                                     │  │
│  │  - Browser History API                                │  │
│  │  - Location Parsing                                   │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## Initialization Flow

### Step 1: Router Creation

```typescript
const router = createRouter({
  routeTree,        // Route tree structure
  context: {...},   // Root context
  defaultPreload: 'intent',
  // ... other options
})
```

**What happens:**

```
┌─────────────────────────────────────────────────────────────┐
│  1. RouterCore Constructor                                  │
│     ├─ Creates Store<RouterState>                           │
│     ├─ Initializes History (BrowserHistory)                  │
│     ├─ Sets up default options                              │
│     └─ Calls update() method                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Route Tree Processing                                    │
│     ├─ processRouteTree(routeTree)                          │
│     │   ├─ Builds Segment Trie                              │
│     │   ├─ Creates routesById map                           │
│     │   ├─ Creates routesByPath map                         │
│     │   └─ Sorts routes by specificity                      │
│     └─ Stores processedTree                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Initial Location Setup                                   │
│     ├─ parseLocation(history.location)                      │
│     │   ├─ Applies rewrite rules (if any)                   │
│     │   ├─ Parses search params                             │
│     │   └─ Normalizes pathname                             │
│     └─ Creates initial RouterState                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Initial Load                                             │
│     ├─ matchRoutes(location.pathname)                       │
│     ├─ loadMatches(matches)                                 │
│     └─ Updates RouterState                                  │
└─────────────────────────────────────────────────────────────┘
```

### Step 2: Router Provider Setup

```typescript
<RouterProvider router={router} />
```

**What happens:**

```
┌─────────────────────────────────────────────────────────────┐
│  RouterProvider Component                                    │
│  ├─ Subscribes to router state changes                      │
│  ├─ Sets up history listener                                │
│  ├─ Calls router.load() on mount                            │
│  └─ Renders Outlet with matched routes                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Route Tree Processing

### Route Tree Structure

```
Route Tree (User-defined)
│
├─ Root Route (__root.tsx)
│  ├─ path: undefined (always matches)
│  ├─ component: <html><body>...</body></html>
│  └─ children:
│     ├─ Index Route (/)
│     ├─ About Route (/about)
│     └─ Posts Route (/posts)
│        └─ children:
│           ├─ Index Route (/posts)
│           └─ Post Route (/posts/$postId)
```

### Processing Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Parse Route Segments                                │
│                                                              │
│  Route: /posts/$postId                                       │
│  Segments:                                                    │
│    [0] { type: 'pathname', value: 'posts' }                 │
│    [1] { type: 'param', value: 'postId' }                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Build Segment Trie                                  │
│                                                              │
│  Root                                                        │
│  └─ posts (static)                                          │
│     └─ $postId (dynamic)                                    │
│                                                              │
│  Trie Structure:                                            │
│  {                                                           │
│    static: Map {                                             │
│      'posts' => {                                            │
│        dynamic: [                                            │
│          { param: 'postId', route: PostRoute }              │
│        ]                                                     │
│      }                                                       │
│    }                                                         │
│  }                                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Sort Routes by Specificity                          │
│                                                              │
│  Order:                                                       │
│  1. Index routes (/)                                        │
│  2. Static routes (most specific first)                      │
│  3. Dynamic routes (longest first)                          │
│  4. Wildcard routes (*)                                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 4: Create Lookup Maps                                  │
│                                                              │
│  routesById: {                                               │
│    '__root__': RootRoute,                                    │
│    '/': IndexRoute,                                          │
│    '/posts': PostsRoute,                                     │
│    '/posts/$postId': PostRoute                              │
│  }                                                           │
│                                                              │
│  routesByPath: {                                             │
│    '/': IndexRoute,                                          │
│    '/about': AboutRoute,                                     │
│    '/posts': PostsRoute,                                     │
│    '/posts/$postId': PostRoute                              │
│  }                                                           │
└─────────────────────────────────────────────────────────────┘
```

---

## Navigation Flow

### Complete Navigation Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  User Action: Click Link or Call navigate()                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Build Location                                           │
│     router.buildLocation({ to: '/posts/123' })               │
│     ├─ Resolve relative path                                │
│     ├─ Interpolate path params                              │
│     ├─ Apply search param middleware                        │
│     ├─ Validate search params                               │
│     └─ Apply rewrite rules (output)                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Commit to History                                        │
│     router.commitLocation(location)                         │
│     ├─ Check for blockers                                   │
│     ├─ Apply view transition (if enabled)                    │
│     ├─ history.push() or history.replace()                  │
│     └─ Update latestLocation                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  3. History Listener Fires                                   │
│     History emits 'change' event                             │
│     └─ Router.updateLatestLocation()                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Load Process Starts                                       │
│     router.load()                                            │
│     ├─ Emit 'onBeforeNavigate' event                        │
│     ├─ Cancel pending matches                                │
│     └─ Call beforeLoad()                                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Match Routes                                             │
│     router.matchRoutes(location.pathname)                    │
│     ├─ Traverse segment trie                                │
│     ├─ Extract path params                                   │
│     ├─ Validate path params                                 │
│     ├─ Validate search params                                │
│     └─ Create RouteMatch objects                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Update Pending State                                     │
│     router.__store.setState({                               │
│       status: 'pending',                                    │
│       isLoading: true,                                       │
│       pendingMatches: matches                                │
│     })                                                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  7. Load Matches (Data Loading)                              │
│     loadMatches({ matches, location })                       │
│     ├─ Execute beforeLoad hooks (serial)                     │
│     ├─ Execute loaders (parallel)                           │
│     ├─ Load route chunks (code splitting)                   │
│     └─ Update match status                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  8. Commit Matches                                           │
│     ├─ Move pendingMatches → matches                        │
│     ├─ Move old matches → cachedMatches                      │
│     ├─ Emit 'onLoad' event                                   │
│     ├─ Emit 'onResolved' event                               │
│     └─ Call onEnter/onStay/onLeave hooks                     │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  9. Render                                                   │
│     ├─ RouterProvider re-renders                             │
│     ├─ Outlet renders matched route components               │
│     ├─ Emit 'onRendered' event                               │
│     └─ Scroll restoration (if enabled)                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Route Matching

### Matching Algorithm

```
Pathname: /posts/123
```

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: Split Pathname                                     │
│  ['posts', '123']                                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 2: Traverse Segment Trie                               │
│                                                              │
│  Start: Root Node                                           │
│  ├─ Try static match: 'posts'                               │
│  │  └─ Found! Move to posts node                           │
│  │     ├─ Try index route: '/' (no match)                  │
│  │     ├─ Try static match: '123' (no match)              │
│  │     └─ Try dynamic match: $postId                       │
│  │        └─ Match! Extract param: { postId: '123' }      │
│  └─ Return: PostRoute with params                          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Step 3: Build Match Branch                                  │
│                                                              │
│  Matches:                                                    │
│  [0] RootRoute (always matches)                             │
│  [1] PostsRoute (/posts)                                     │
│  [2] PostRoute (/posts/$postId)                             │
│                                                              │
│  Each match contains:                                        │
│  - routeId                                                   │
│  - pathname (interpolated)                                    │
│  - params (extracted)                                        │
│  - search (validated)                                        │
│  - context (accumulated)                                     │
└─────────────────────────────────────────────────────────────┘
```

### Matching Priority

```
Route Matching Order (Most Specific First):

1. Index Routes (/)
   └─ Exact match for pathname

2. Static Routes
   └─ Exact string match
   └─ Example: /about, /contact

3. Dynamic Routes
   └─ Matches any value
   └─ Example: /posts/$postId
   └─ Longer paths prioritized

4. Wildcard Routes (*)
   └─ Matches everything
   └─ Fallback for 404
```

---

## Data Loading Pipeline

### Loader Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Before Load (Serial)                              │
│                                                              │
│  For each match in order:                                    │
│  ┌────────────────────────────────────────────────────┐   │
│  │  beforeLoad Hook                                     │   │
│  │  ├─ Can throw redirect()                            │   │
│  │  ├─ Can throw notFound()                             │   │
│  │  ├─ Can return context                              │   │
│  │  └─ Updates match.__beforeLoadContext                │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  Context accumulates:                                         │
│  Root Context → Route 1 Context → Route 2 Context          │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Load Route Chunks (Parallel)                        │
│                                                              │
│  For each match:                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  loadRouteChunk(route)                              │   │
│  │  ├─ Check if already loaded                         │   │
│  │  ├─ If lazy: import(route.lazyFn)                    │   │
│  │  └─ Resolve component/module                        │   │
│  └────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Execute Loaders (Parallel)                        │
│                                                              │
│  For each match:                                             │
│  ┌────────────────────────────────────────────────────┐   │
│  │  loader Function                                    │   │
│  │  ├─ Receives: params, search, context              │   │
│  │  ├─ Can fetch data                                  │   │
│  │  ├─ Can throw redirect()                            │   │
│  │  ├─ Can throw notFound()                            │   │
│  │  └─ Returns: data                                   │   │
│  └────────────────────────────────────────────────────┘   │
│                                                              │
│  All loaders run in parallel                                 │
│  Results stored in match.data                                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Update Match Status                                │
│                                                              │
│  For each match:                                             │
│  ├─ status: 'success' | 'error' | 'notFound'                │
│  ├─ data: loader result                                     │
│  ├─ error: error object (if any)                            │
│  └─ context: final merged context                           │
└─────────────────────────────────────────────────────────────┘
```

### Loader Context Building

```
┌─────────────────────────────────────────────────────────────┐
│  Context Accumulation                                       │
│                                                              │
│  Root Route Context                                         │
│  { queryClient, theme: 'dark' }                             │
│         │                                                    │
│         ▼                                                    │
│  Posts Route Context                                         │
│  { queryClient, theme: 'dark', posts: [...] }              │
│         │                                                    │
│         ▼                                                    │
│  Post Route Context                                          │
│  { queryClient, theme: 'dark', posts: [...],              │
│    post: {...} }                                            │
└─────────────────────────────────────────────────────────────┘
```

---

## State Management

### Router State Structure

```typescript
interface RouterState {
  // Status
  status: 'pending' | 'idle'
  isLoading: boolean
  isTransitioning: boolean
  loadedAt: number

  // Location
  location: ParsedLocation
  resolvedLocation?: ParsedLocation

  // Matches
  matches: Array<RouteMatch> // Active matches
  pendingMatches?: Array<RouteMatch> // Loading matches
  cachedMatches: Array<RouteMatch> // Cached matches

  // HTTP
  statusCode: number
  redirect?: AnyRedirect
}
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────┐
│  State Machine                                              │
│                                                              │
│  idle ──[navigate]──> pending ──[load complete]──> idle     │
│   │                          │                              │
│   │                          └──[error]──> idle (error)    │
│   │                                                          │
│   └──[invalidate]──> pending                                  │
└─────────────────────────────────────────────────────────────┘
```

### Match Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  Match States                                                │
│                                                              │
│  Created (pendingMatches)                                    │
│    │                                                          │
│    ├─ beforeLoad ──> isFetching: 'beforeLoad'                │
│    │                                                          │
│    ├─ loader ──> isFetching: 'loader'                       │
│    │                                                          │
│    └─ Complete ──> status: 'success'                         │
│                      │                                        │
│                      ├─> matches (active)                     │
│                      │                                        │
│                      └─> cachedMatches (when replaced)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Caching Strategy

### Cache Structure

```
┌─────────────────────────────────────────────────────────────┐
│  Match Cache                                                 │
│                                                              │
│  Active Matches (matches)                                    │
│  ├─ Currently rendered routes                               │
│  └─ Always kept in memory                                   │
│                                                              │
│  Cached Matches (cachedMatches)                             │
│  ├─ Previously loaded routes                                 │
│  ├─ Reused when navigating back                              │
│  └─ Garbage collected after gcTime                          │
│                                                              │
│  Pending Matches (pendingMatches)                           │
│  ├─ Currently loading routes                                │
│  └─ Moved to matches when complete                           │
└─────────────────────────────────────────────────────────────┘
```

### Cache Invalidation

```
┌─────────────────────────────────────────────────────────────┐
│  Invalidation Triggers                                       │
│                                                              │
│  1. Manual Invalidation                                      │
│     router.invalidate({ filter: (match) => ... })           │
│                                                              │
│  2. Stale Time Expiration                                    │
│     staleTime: 5 minutes (default: 0)                        │
│                                                              │
│  3. Garbage Collection                                       │
│     gcTime: 30 minutes (default: 30 min)                     │
│     ├─ Removes unused cached matches                         │
│     └─ Runs after navigation                                 │
│                                                              │
│  4. Error State                                             │
│     Matches with status: 'error' are not cached              │
│                                                              │
│  5. Navigation                                              │
│     Old matches → cachedMatches                              │
│     New matches → matches                                    │
└─────────────────────────────────────────────────────────────┘
```

### Preloading

```
┌─────────────────────────────────────────────────────────────┐
│  Preload Flow                                                │
│                                                              │
│  User hovers over <Link>                                     │
│    │                                                          │
│    ▼                                                          │
│  router.preloadRoute({ to: '/posts/123' })                   │
│    │                                                          │
│    ├─> matchRoutes()                                         │
│    ├─> loadMatches() (preload: true)                         │
│    └─> Store in cachedMatches                                │
│                                                              │
│  User clicks <Link>                                           │
│    │                                                          │
│    ▼                                                          │
│  Check cachedMatches for existing match                      │
│    │                                                          │
│    ├─> Found: Reuse (instant navigation)                     │
│    └─> Not found: Load normally                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Concepts Summary

### 1. **Route Tree → Segment Trie**

- Routes are organized in a tree structure
- Processed into a segment trie for efficient matching
- Routes sorted by specificity for matching priority

### 2. **Location → Matches → Data → Render**

- URL parsed into ParsedLocation
- Location matched against route tree → RouteMatches
- Matches loaded (beforeLoad → loader)
- Components rendered with data

### 3. **State Management**

- Reactive Store tracks router state
- Three match arrays: matches, pendingMatches, cachedMatches
- State transitions: idle → pending → idle

### 4. **Caching**

- Built-in SWR-style caching
- Matches cached for reuse
- Automatic garbage collection
- Preloading for instant navigation

### 5. **Type Safety**

- Full TypeScript inference
- Type-safe navigation
- Type-safe params and search
- Type-safe context

---

## Performance Optimizations

1. **Segment Trie**: O(log n) route matching instead of O(n)
2. **LRU Cache**: Cached route matches and path resolutions
3. **Parallel Loading**: Loaders execute in parallel
4. **Code Splitting**: Lazy route chunks loaded on demand
5. **Structural Sharing**: Minimizes re-renders with deep equality checks
6. **Preloading**: Instant navigation for preloaded routes

---

## Error Handling

```
┌─────────────────────────────────────────────────────────────┐
│  Error Types                                                 │
│                                                              │
│  1. Redirect                                                 │
│     throw redirect({ to: '/login' })                         │
│     └─> Navigation to new route                              │
│                                                              │
│  2. Not Found                                                 │
│     throw notFound()                                          │
│     └─> Renders NotFoundComponent                            │
│                                                              │
│  3. Error                                                     │
│     throw new Error('...')                                    │
│     └─> Renders ErrorComponent                                │
│                                                              │
│  4. Search Param Error                                       │
│     SearchParamError                                         │
│     └─> Stored in match.searchError                          │
│                                                              │
│  5. Path Param Error                                         │
│     PathParamError                                           │
│     └─> Stored in match.paramsError                          │
└─────────────────────────────────────────────────────────────┘
```

---

This architecture provides a robust, type-safe, and performant routing solution that handles complex navigation scenarios while maintaining excellent developer experience.


