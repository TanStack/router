# RFC: Parallel Route Slots

**Status:** Draft  
**Author:** Tanner Linsley  
**Created:** 2026-01-04

---

## Overview

This RFC proposes **Parallel Route Slots** - a system for rendering multiple independent route trees simultaneously, with each slot's state persisted in the URL via search parameters. This enables shareable, bookmarkable, SSR-compatible parallel routing without relying on client-side memory or React Server Components.

---

## Motivation

### The Problem

Complex UIs often require multiple independent navigable areas:

- **Modals** with internal navigation (e.g., multi-step wizards, user profile modals with tabs)
- **Drawers** with their own route hierarchy (e.g., notification drawer with nested views)
- **Split-pane layouts** where each pane navigates independently (e.g., email client, IDE-like interfaces)
- **Dashboard widgets** that fetch data in parallel (e.g., activity feed, metrics panels, quick actions)

Current solutions in other frameworks fall short:

| Framework          | Approach                                        | URL Persisted? | Survives Refresh?               | Shareable? |
| ------------------ | ----------------------------------------------- | -------------- | ------------------------------- | ---------- |
| Next.js App Router | `@folder` parallel routes                       | No             | No (uses `default.js` fallback) | No         |
| Remix              | Proposed "Sibling Routes" but never implemented | N/A            | N/A                             | N/A        |
| SvelteKit          | No parallel route support                       | N/A            | N/A                             | N/A        |
| React Router       | No parallel route support                       | N/A            | N/A                             | N/A        |

### Why Existing Solutions Fail

**Next.js Parallel Routes:**

- Slot state lives in client memory during soft navigation
- On hard refresh, falls back to `default.js` - losing the user's place
- Cannot share a URL that includes modal/drawer state
- Bookmarking captures only the main route, not slot state

**Remix "Sibling Routes" Proposal:**

- Discussed in 2023 (Discussion #5431) but never implemented
- Team punted to RSC as the solution
- RSC doesn't actually solve URL persistence

### The Solution

Persist slot state in search parameters:

```
/dashboard?@modal=/users/123&@modal.tab=profile&@drawer=/notifications
```

This gives us:

- **Shareable** - copy/paste URL includes complete slot state
- **Bookmarkable** - save the exact UI state including all open slots
- **SSR-compatible** - server sees slot paths in search params, can render correctly
- **Refresh-safe** - no state loss on browser refresh
- **Type-safe** - full TypeScript inference for slot navigation
- **Back/forward compatible** - browser history works naturally

---

## Design Principles

1. **URL is the source of truth** - Slot state lives in search params, not memory
2. **Slots are just route trees** - Same mental model as regular routes (loaders, components, search params, etc.)
3. **Parallel by default** - All matched slot loaders run in parallel with main route loaders
4. **Independent streaming** - Each slot can suspend independently
5. **Type-safe throughout** - Slot navigation is fully typed against the slot's route tree
6. **Progressive adoption** - Additive feature, no breaking changes to existing apps

---

## URL Structure

### Default Behavior: Slots Render Automatically

Slots render by default when their parent route matches - no URL param needed for the default state. The URL only stores _deviations_ from the default:

```
/dashboard                           # all slots render at their root path
/dashboard?@activity=/recent         # activity navigated away from root
/dashboard?@modal=/users/123         # modal open (if optional) or navigated
/dashboard?@metrics=false            # metrics explicitly disabled
```

This keeps URLs clean. A dashboard with 5 widgets doesn't need 5 params just to show the default state.

### When URL Params Are Needed

A slot's state appears in the URL only when:

1. **Navigated away from root** - `@modal=/users/123`
2. **Has search params** - `@modal.tab=profile`
3. **Explicitly disabled** - `@metrics=false` (opt-out of default rendering)

### Slot Path Syntax

```
?@modal=/users/123           # slot at specific path
?@modal=/settings/profile    # nested path within slot
?@modal                      # slot at root (rarely needed, see below)
?@modal=false                # slot explicitly closed/disabled
```

The bare `@slotName` (no value) is only needed when you want to force a slot open that has `enabled` returning false by default, or to be explicit.

### Slot Search Params

Slot-specific search params use dot notation:

```
?@modal=/users/123&@modal.tab=profile&@modal.page=2
```

Inside the slot's routes, these are accessed as just `tab` and `page` - the prefix is stripped.

### Combined Example

```
/dashboard?filter=active&@modal=/users/123&@modal.tab=profile
           ^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^^^
           main route    modal navigated   modal search params
           search        (not at root)
```

vs the clean default:

```
/dashboard?filter=active    # all default slots render, modal closed (if optional)
```

### Configuration

```ts
createRouter({
  slotPrefix: '@', // default, configurable per-router
})
```

---

## Route Definition

### Slots Are Defined in Isolation

Just like child routes, **slots don't need to be declared on their parent route**. They're defined as separate `@slotName` files and automatically composed into the route tree at generation time.

The parent route discovers its slots after composition and can reference them type-safely in its component.

### Global Slots (Children of Root)

Global slots are `@slotName` files at the routes root - they become children of `__root.tsx`:

```ts
// @modal.tsx - defined in isolation, no parent reference needed
export const Route = createSlotRoute({
  component: ModalWrapper,
})

// @modal.users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  loader: ({ params }) => fetchUser(params.id),
  component: UserModal,
})
```

```ts
// __root.tsx - doesn't declare slots, just renders them
export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <body>
        <Outlet />
        {/* Type-safe: Route.Outlet knows available slots */}
        <Route.Outlet slot="modal" />
        <Route.Outlet slot="drawer" />
      </body>
    </html>
  )
}
```

### Route-Scoped Slots

Scoped slots use the `parentRoute.@slotName` file pattern:

```ts
// dashboard.@activity.tsx - scoped to dashboard route
export const Route = createSlotRoute({
  loader: () => fetchActivityFeed(),
  component: ActivityWidget,
})

// dashboard.@metrics.tsx
export const Route = createSlotRoute({
  loader: () => fetchMetrics(),
  component: MetricsWidget,
})
```

```ts
// dashboard.tsx - doesn't declare slots, discovers them after composition
export const Route = createFileRoute('/dashboard')({
  component: Dashboard,
})

function Dashboard() {
  return (
    <div className="grid grid-cols-3 gap-4">
      <aside>
        {/* Type-safe: Route.Outlet knows available slots */}
        <Route.Outlet slot="activity" />
      </aside>
      <main>
        <Outlet />
      </main>
      <aside>
        <Route.Outlet slot="metrics" />
        <Route.Outlet slot="quickActions" />
      </aside>
    </div>
  )
}
```

### How Composition Works

The route generator:

1. Detects `@slotName` files
2. Associates them with their parent route (root for `@modal`, dashboard for `dashboard.@activity`)
3. Generates the slot route trees
4. Makes slots available on `Route` for type-safe access in components

This mirrors how child routes work - parents don't declare children, children reference parents, and composition wires everything together.

---

## File-Based Convention

Slots use the `@slotName` prefix in file names. Both flat and directory styles work, matching existing TanStack Router conventions.

### Flat Style

```
routes/
├── __root.tsx
├── @modal.tsx                    # global slot root
├── @modal.index.tsx              # @modal=/
├── @modal.users.$id.tsx          # @modal=/users/123
├── @modal.settings.tsx           # @modal=/settings
├── @drawer.tsx                   # global slot root
├── @drawer.notifications.tsx     # @drawer=/notifications
├── dashboard.tsx
├── dashboard.index.tsx
├── dashboard.@activity.tsx       # route-scoped slot root
├── dashboard.@activity.index.tsx
├── dashboard.@metrics.tsx
└── dashboard.@metrics.index.tsx
```

### Directory Style

```
routes/
├── __root.tsx
├── @modal/
│   ├── route.tsx                 # slot root
│   ├── index.tsx                 # @modal=/
│   ├── users.$id.tsx             # @modal=/users/123
│   └── settings.tsx              # @modal=/settings
├── @drawer/
│   ├── route.tsx
│   └── notifications.tsx
└── dashboard/
    ├── route.tsx
    ├── index.tsx
    ├── @activity/
    │   ├── route.tsx
    │   └── index.tsx
    └── @metrics/
        ├── route.tsx
        └── index.tsx
```

### Mixed (Whatever Makes Sense)

```
routes/
├── __root.tsx
├── @modal.tsx                    # simple slot root
├── @modal/
│   ├── users.$id.tsx             # children in folder
│   └── settings.tsx
├── dashboard.tsx
├── dashboard.@activity.tsx       # inline scoped slot
└── dashboard.@activity.index.tsx
```

### Generator Behavior

The route generator:

1. Detects `@slotName` prefixed files/folders
2. Associates each slot with its parent route based on file path
3. Generates typed slot route trees
4. Augments parent route types so `Route.Outlet` slot prop, `Route.Slots`, etc. are type-safe

```ts
// Generated routeTree.gen.ts (simplified)

// Slot routes generated from @modal.tsx, @modal.users.$id.tsx, etc.
const modalSlotRoot = createSlotRoute({ ... })
const modalUsersIdRoute = createSlotRoute({ path: '/users/$id', ... })
const modalSlotTree = modalSlotRoot.addChildren([modalUsersIdRoute, ...])

// Root route - slots are attached during composition, not in user code
export const rootRoute = createRootRoute({ ... })
  ._addSlots({ modal: modalSlotTree, drawer: drawerSlotTree })

// Dashboard route with its scoped slots
export const dashboardRoute = createFileRoute('/dashboard')({ ... })
  ._addSlots({ activity: activitySlotTree, metrics: metricsSlotTree })
```

The `_addSlots` is internal - users never call it. The generator wires everything based on file structure.

---

## Navigation API

### Core Principle: Type-Safe Slot Hierarchy

Slots are scoped to specific routes. For type-safe slot navigation, `Link` and `useNavigate` need to know the current route context (via `from`) to determine which slots are available.

Two approaches:

1. **Use `from` prop** - Explicit route context for type safety
2. **Use `Route.Link`** - Route object's Link has implicit `from`

### Basic Slot Navigation

Navigate a slot using the `slots` property:

```tsx
// Using Route.Link (from is implicit)
import { Route } from './routes/dashboard'

<Route.Link slots={{ activity: { to: '/recent' } }}>
  Recent Activity
</Route.Link>

// Using global Link with explicit from
<Link from="/dashboard" slots={{ activity: { to: '/recent' } }}>
  Recent Activity
</Link>

// Programmatic navigation with from
const navigate = useNavigate({ from: '/dashboard' })
navigate({ slots: { activity: { to: '/recent' } } })
```

### Why `from` Matters

The `from` route determines which slots are available in the type system:

```tsx
// Dashboard has @activity, @metrics slots
// Root has @modal slot

// ✅ from="/dashboard" - activity slot available
<Link from="/dashboard" slots={{ activity: { to: '/recent' } }}>

// ❌ Type error - activity not on root
<Link from="/" slots={{ activity: { to: '/recent' } }}>

// ✅ modal is on root, available from anywhere
<Link from="/dashboard" slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>
```

### Slot Navigation Options

```tsx
// Navigate to a path within the slot
<Route.Link slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>

// Open slot at root (to: '/' is default when omitted)
<Route.Link slots={{ modal: {} }}>

// Update just search params (preserve current path)
<Route.Link slots={{ modal: { search: { tab: 'profile' } } }}>

// Close slot
<Route.Link slots={{ modal: null }}>

// Disable a slot that renders by default
<Route.Link slots={{ notifications: false }}>
```

### Combined Main Route + Slot Navigation

Navigate the main route and slots atomically:

```tsx
// Navigate to dashboard AND open modal
<Link
  from="/"
  to="/dashboard"
  slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}
>
  View User on Dashboard
</Link>

// From dashboard, navigate to dashboard (stay), update slots
<Route.Link
  to="/dashboard"
  slots={{
    modal: null,
    activity: { to: '/recent' },
  }}
>
  Dashboard with Recent Activity
</Route.Link>
```

### Route-Scoped Slots

Slots scoped to specific routes require the `from` to include that route:

```tsx
// dashboard.@activity is scoped to /dashboard

// ✅ Valid - from="/dashboard" knows about activity slot
<Link from="/dashboard" slots={{ activity: { to: '/recent' } }}>
  Recent Activity
</Link>

// ✅ Same thing using Route.Link
import { Route } from './routes/dashboard'
<Route.Link slots={{ activity: { to: '/recent' } }}>
  Recent Activity
</Route.Link>

// ❌ Type error - from="/settings" doesn't have activity slot
<Link from="/settings" slots={{ activity: { to: '/recent' } }}>

// When navigating TO a route, its slots become available
<Link from="/" to="/dashboard" slots={{ activity: { to: '/recent' } }}>
  Go to Dashboard with Activity
</Link>
```

### Nested Slot Navigation

For slots within slots, nest the `slots` property:

```tsx
// Modal has a nested @confirm slot
<Route.Link
  slots={{
    modal: {
      to: '/settings',
      slots: {
        confirm: { to: '/delete' },
      },
    },
  }}
>
  Delete Settings
</Route.Link>
// URL: ?@modal=/settings&@modal@confirm=/delete
```

### Navigation Within Slots

When inside a slot component, use `Route.Link` from the slot's route for the implicit `from`:

```tsx
// Inside @modal/users.$id.tsx
import { Route } from './@modal.users.$id'

function UserModal() {
  return (
    <div>
      {/* Navigate within the modal - Route.Link knows we're in modal context */}
      <Route.Link slots={{ modal: { to: '/settings' } }}>Settings</Route.Link>

      <Route.Link
        slots={{ modal: { to: '/users/$id', params: { id: '456' } } }}
      >
        Other User
      </Route.Link>

      {/* Close the modal */}
      <Route.Link slots={{ modal: null }}>Close</Route.Link>

      {/* Navigate main route (modal stays open - shallow merge) */}
      <Route.Link to="/dashboard">Go to Dashboard</Route.Link>

      {/* Navigate main route AND close modal */}
      <Route.Link to="/dashboard" slots={{ modal: null }}>
        Go to Dashboard and Close
      </Route.Link>
    </div>
  )
}
```

### Shallow Merge Behavior

Unmentioned slots are preserved by default:

```tsx
// Current URL: /dashboard?@modal=/users/123&@activity=/feed

// Update just modal - activity preserved
<Route.Link slots={{ modal: { to: '/settings' } }}>
// Result: /dashboard?@modal=/settings&@activity=/feed

// Navigate main route only - all slots preserved
<Route.Link to="/settings">
// Result: /settings?@modal=/users/123&@activity=/feed

// Explicitly close one slot
<Route.Link slots={{ modal: null }}>
// Result: /dashboard?@activity=/feed
```

### Type Safety

The `slots` property is fully typed based on `from` (implicit or explicit) and `to`:

```tsx
// Root has @modal, @drawer
// Dashboard has @activity, @metrics

// ✅ Valid - from root, modal available; to dashboard, activity available
<Link from="/" to="/dashboard" slots={{
  modal: { to: '/users/$id', params: { id: '123' } },
  activity: { to: '/recent' },
}}>

// ✅ Valid - using DashboardRoute.Link, activity is available
<DashboardRoute.Link slots={{ activity: { to: '/recent' } }}>

// ❌ Type error - from="/settings", activity not available
<Link from="/settings" slots={{ activity: { to: '/recent' } }}>

// ❌ Type error - route doesn't exist in modal slot
<Route.Link slots={{ modal: { to: '/nonexistent' } }}>

// ❌ Type error - missing required param
<Route.Link slots={{ modal: { to: '/users/$id' } }}>

// ❌ Type error - invalid search param
<Link slots={{ modal: { to: '/users/$id', params: { id: '123' }, search: { invalid: true } } }}>
```

### useNavigate Hook

Same API, programmatic. Requires `from` for type safety:

```ts
// With explicit from
const navigate = useNavigate({ from: '/dashboard' })

// Navigate slot (activity available because from="/dashboard")
navigate({ slots: { activity: { to: '/recent' } } })

// Navigate main + slots
navigate({
  to: '/dashboard',
  slots: {
    modal: { to: '/settings' },
    activity: { to: '/recent' },
  },
})

// Close slot
navigate({ slots: { modal: null } })
```

Or use the Route's `useNavigate`:

```ts
import { Route } from './routes/dashboard'

function DashboardComponent() {
  const navigate = Route.useNavigate()

  // Type-safe - knows dashboard's slots
  navigate({ slots: { activity: { to: '/recent' } } })
}
```

### API Summary

| Action               | Syntax                                               |
| -------------------- | ---------------------------------------------------- |
| Open slot to path    | `slots: { name: { to: '/path', params } }`           |
| Open slot to root    | `slots: { name: {} }`                                |
| Update slot search   | `slots: { name: { search: {...} } }`                 |
| Close slot           | `slots: { name: null }`                              |
| Disable default slot | `slots: { name: false }`                             |
| Nested slots         | `slots: { parent: { to, slots: { child: {...} } } }` |
| Preserve slots       | Don't mention them (shallow merge)                   |
| Main + slots         | `to: '/path', slots: {...}`                          |

---

## Rendering API

### Rendering Slots with Outlet

Rather than a new `SlotOutlet` component, the existing `Outlet` component is extended with a `slot` prop:

```tsx
// Render a slot (from is implicit when using Route.Outlet)
<Route.Outlet slot="modal" />

// With explicit from for type safety
<Outlet from="/dashboard" slot="activity" />

// With fallback when slot is closed/empty
<Outlet from="/dashboard" slot="modal" fallback={null} />
<Outlet from="/dashboard" slot="modal" fallback={<ModalPlaceholder />} />

// Nested slots use dot notation
<Outlet from="/" slot="modal.confirm" />
```

The `from` prop determines which slots are available (type-safe). When using `Route.Outlet`, the `from` is implicit.

### Regular Outlet (No slot prop)

Without the `slot` prop, `Outlet` renders child routes as usual:

```tsx
function Dashboard() {
  return (
    <div>
      {/* Regular child routes */}
      <Outlet />

      {/* Slot outlets */}
      <Route.Outlet slot="activity" />
      <Route.Outlet slot="metrics" />
    </div>
  )
}
```

### Accessing Slot State

Existing router hooks work with slots - slot routes use `/@slotName` prefix in their path:

```ts
// Check if a slot route matches
const modalMatch = useMatch({
  from: '/@modal/users/$id', // slot routes use @slotName prefix in path
  shouldThrow: false,
})
const isModalOpen = !!modalMatch

// Get loader data from a slot route
const userData = useLoaderData({ from: '/@modal/users/$id' })

// Get search params from a slot route
const { tab } = useSearch({ from: '/@modal/users/$id' })

// Get params from a slot route
const { id } = useParams({ from: '/@modal/users/$id' })
```

### Inside Slot Components

When inside a slot component, the standard hooks work normally - they reference the current slot route:

```tsx
// Inside @modal/users.$id.tsx
function UserModal() {
  // These work exactly like in regular routes
  const { user } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const { id } = Route.useParams()
  const navigate = Route.useNavigate()

  return (
    <div>
      <h2>{user.name}</h2>
      <Route.Link slots={{ modal: null }}>Close</Route.Link>
    </div>
  )
}
```

### Checking Slot Open State

To check if a slot is open (from outside the slot):

```tsx
function ModalTrigger() {
  // Match against the slot's root route
  const modalMatch = useMatch({ from: '/@modal', shouldThrow: false })
  const isOpen = !!modalMatch

  if (isOpen) {
    return <Route.Link slots={{ modal: null }}>Close Modal</Route.Link>
  }

  return (
    <Route.Link slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>
      Open User Modal
    </Route.Link>
  )
}
```

### Route Path Convention for Slots

Slot routes use `/@slotName` prefix in their full path for `useMatch`, `useLoaderData`, etc:

```
Main route:     /dashboard
Slot route:     /@modal/users/$id
Nested slot:    /@modal/@confirm/delete
Scoped slot:    /dashboard/@activity/recent
```

This mirrors the URL structure and makes it clear you're referencing a slot route.

---

## Component Routes (Auto-Rendering Slots)

**Slots render by default when their parent route matches.** No URL param needed for the default state. This makes slots ideal for dashboard widgets that should "just work".

### Default Behavior

```ts
// dashboard.@activity.tsx
export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'sidebar',
    priority: 1,
  },
  loader: () => fetchActivityFeed(),
  component: ActivityWidget,
})
```

When you navigate to `/dashboard`, the activity slot:

- Automatically renders (no `@activity` param needed)
- Runs its loader in parallel with the dashboard loader
- Only appears in URL if navigated away from root: `@activity=/other-view`

### Conditional Slots (Opt-Out)

Use `enabled` to conditionally _disable_ a slot that would otherwise render:

```ts
// dashboard.@adminPanel.tsx
export const Route = createSlotRoute({
  path: '/',
  // Only render for admin users
  enabled: ({ context }) => context.user.role === 'admin',
  loader: () => fetchAdminStats(),
  component: AdminPanel,
})

// dashboard.@notifications.tsx
export const Route = createSlotRoute({
  path: '/',
  // User can disable in preferences
  enabled: ({ context }) =>
    context.user.preferences.showNotifications !== false,
  component: NotificationsWidget,
})
```

When `enabled` returns `false`:

- The slot doesn't render
- The slot's loader doesn't run
- The slot doesn't appear in `<Route.Slots>` iteration

Users can also force-disable via URL: `?@notifications=false`

### Using staticData for Filtering/Grouping

Use the existing `staticData` (type-safe and extensible via module declaration) to organize slots:

```ts
// Extend staticData types for your app (optional)
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    area?: 'sidebar' | 'main' | 'header'
    priority?: number
    title?: string
    collapsible?: boolean
  }
}

// dashboard.@activity.tsx
export const Route = createSlotRoute({
  path: '/',
  staticData: {
    area: 'sidebar',
    priority: 1,
    title: 'Activity',
    collapsible: true,
  },
  component: ActivityWidget,
})
```

### Iterating Over Slots

The parent route can iterate over all its slots dynamically:

```tsx
// dashboard.tsx
function Dashboard() {
  return (
    <div className="dashboard">
      <Route.Slots>
        {(slots) => (
          <>
            {/* Filter slots by staticData and render in specific areas */}
            <aside className="sidebar">
              {slots
                .filter((slot) => slot.staticData?.area === 'sidebar')
                .sort(
                  (a, b) =>
                    (a.staticData?.priority ?? 0) -
                    (b.staticData?.priority ?? 0),
                )
                .map((slot) => (
                  <div key={slot.name} className="widget">
                    <slot.Outlet />
                  </div>
                ))}
            </aside>

            <main>
              <Outlet />
            </main>

            <aside className="widgets">
              {slots
                .filter((slot) => slot.staticData?.area === 'widgets')
                .map((slot) => (
                  <div key={slot.name} className="widget">
                    <h3>{slot.staticData?.title}</h3>
                    <slot.Outlet />
                  </div>
                ))}
            </aside>
          </>
        )}
      </Route.Slots>
    </div>
  )
}
```

### Slot Object Shape

Each slot in the render prop provides:

```ts
interface SlotRenderInfo {
  name: string // slot name (e.g., 'activity')
  staticData: StaticDataRouteOption // from slot route definition (type-safe!)
  isOpen: boolean // is this slot currently active?
  path: string | null // current path within slot
  matches: RouteMatch[] // slot's route matches
  Outlet: ComponentType // renders the slot content
}
```

### Mixed Approach

You can combine explicit placement with iteration:

```tsx
function Dashboard() {
  return (
    <div className="dashboard">
      {/* Explicitly placed slot */}
      <header>
        <Route.Outlet slot="header" />
      </header>

      {/* Dynamically rendered slots */}
      <Route.Slots>
        {(slots) => (
          <div className="widget-grid">
            {slots
              .filter((s) => s.staticData?.area === 'grid')
              .map((slot) => (
                <slot.Outlet key={slot.name} />
              ))}
          </div>
        )}
      </Route.Slots>

      {/* Explicit main content */}
      <main>
        <Outlet />
      </main>
    </div>
  )
}
```

### File Structure for Component Routes

```
routes/
├── dashboard.tsx                    # parent route with <Route.Slots>
├── dashboard.index.tsx              # main content
├── dashboard.@header.tsx            # explicitly placed
├── dashboard.@activity.tsx          # area: 'grid', priority: 1
├── dashboard.@metrics.tsx           # area: 'grid', priority: 2
├── dashboard.@notifications.tsx     # area: 'grid', priority: 3
├── dashboard.@adminPanel.tsx        # area: 'grid', enabled for admins only
└── dashboard.@quickActions.tsx      # area: 'sidebar'
```

### URL Behavior

Slots render by default - URL only captures deviations:

```
/dashboard                              # all enabled slots render at root
/dashboard?@activity=/recent            # activity navigated to /recent
/dashboard?@notifications=false         # user explicitly hid notifications
/dashboard?@activity=/recent&@metrics=false  # mixed state
```

The URL stays clean for the common case while still capturing all state when needed.

---

## Loader Execution

### Two-Phase Execution

Route loading happens in two phases:

1. **beforeLoad phase** - Serial down the tree, branching in parallel at slots
2. **loader phase** - All loaders run in parallel after all beforeLoads complete

### beforeLoad: Serial to Parent, Then Parallel Branches

Slots are children of routes, so a slot's `beforeLoad` can only start after its parent route's `beforeLoad` completes. Once a route's `beforeLoad` finishes, its child routes AND its slots can begin their `beforeLoad` in parallel.

```
Navigation to /dashboard?@modal=/users/123

Phase 1 - beforeLoad:

__root.beforeLoad()
         ↓
dashboard.beforeLoad()
         ↓
    ┌────┴────────────────────────────────────┐
    │ (parallel from here)                    │
    ↓                    ↓                    ↓
dashboard/index    @activity.beforeLoad()  @metrics.beforeLoad()
.beforeLoad()            ↓                    ↓
                   @activity/index         @metrics/index
                   .beforeLoad()           .beforeLoad()

Meanwhile, @modal runs in parallel after __root completes:

__root.beforeLoad()
         ↓
    ┌────┴────┐
    ↓         ↓
dashboard   @modal.beforeLoad()
(above)           ↓
            @modal/users.$id.beforeLoad()

         ↓ All beforeLoads complete ↓

Phase 2 - loaders (all parallel):
├── dashboard.loader()
├── dashboard/index.loader()
├── @modal/users.$id.loader()
├── @activity/index.loader()
├── @metrics/index.loader()
└── ...
```

### Key Points

- Slots branch off from their parent route
- A slot's `beforeLoad` waits for its parent's `beforeLoad` to complete
- Once a parent completes, ALL its children (routes and slots) can start in parallel
- ALL `beforeLoad`s must complete before ANY loader runs

### Example: Root-Level Modal vs Dashboard Slots

```
/dashboard?@modal=/users/123

__root.beforeLoad()
         │
    ┌────┴────────────┐
    │                 │
    ↓                 ↓
dashboard         @modal           ← both start after __root
.beforeLoad()     .beforeLoad()
    │                 │
    ↓                 ↓
@activity         @modal/users.$id  ← start after their parents
.beforeLoad()     .beforeLoad()
```

- `@modal` is a child of `__root`, so it starts after `__root.beforeLoad()`
- `@activity` is a child of `dashboard`, so it starts after `dashboard.beforeLoad()`
- `@modal` and `dashboard` run in parallel (both children of `__root`)
- `@activity` and `@modal/users.$id` may run at different times depending on when their parents complete

### Slot beforeLoad

Slots can have their own `beforeLoad` for slot-specific auth/guards:

```ts
// @modal/users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  beforeLoad: async ({ params }) => {
    const canViewUser = await checkPermission(params.id)
    if (!canViewUser) {
      throw redirect({ slots: { modal: { to: '/unauthorized' } } })
    }
  },
  loader: ({ params }) => fetchUser(params.id),
})
```

### Loader Phase

After all `beforeLoad`s complete, all loaders run in parallel:

```
All loaders execute in parallel:
├── dashboard.loader()
├── @modal/users.$id.loader()
├── @activity/index.loader()
├── @metrics/index.loader()
└── ...
```

This eliminates waterfall problems. Each widget fetches its own data without blocking others.

---

## Search Params

### Slot-Specific Search Schemas

Each slot route can define its own search schema, just like regular routes:

```ts
// @modal/users.$id.tsx
import { z } from 'zod'

export const Route = createSlotRoute({
  path: '/users/$id',
  validateSearch: z.object({
    tab: z.enum(['profile', 'settings', 'activity']).default('profile'),
    expanded: z.boolean().default(false),
  }),
  component: UserModal,
})

function UserModal() {
  // Slot's own search params (see open question below about exact API)
  const { tab, expanded } = Route.useSearch()

  // Access parent route's search params explicitly
  const { filter } = useSearch({ from: '/dashboard' })
}
```

### URL Namespacing

Slot search params are automatically namespaced in the URL:

```
Main route search:     ?filter=active&page=2
Modal search:          ?@modal.tab=profile&@modal.expanded=true

Combined URL:
/dashboard?filter=active&page=2&@modal=/users/123&@modal.tab=profile&@modal.expanded=true
```

### Open Question: Search Param Access Within Slots

**Context:** Currently in TanStack Router, `useSearch` merges all parent route search params down - all search params are shared across nested routes. If we apply this same pattern to slots, there's a problem:

```ts
// URL: /dashboard?filter=active&@modal=/users/123&@modal.tab=profile

// Inside @modal/users.$id.tsx
const search = Route.useSearch()
// With current merge behavior, this would be:
// { filter: 'active', '@modal.tab': 'profile' }
```

**The problem:** `@modal.tab` is awkward to use in JavaScript:

```ts
const { '@modal.tab': tab } = search // ugly destructuring
const tab = search['@modal.tab'] // bracket notation required
```

**How should slot components access their search params?**

#### Option A: Strip Prefix for Own Params, Merge Parents

Inside the slot, the slot's own params have their prefix stripped, but parent params are merged in as-is:

```ts
// Inside @modal/users.$id.tsx
const { filter, tab } = Route.useSearch()
//      ^^^^^^ from parent (dashboard)
//              ^^^ from slot (prefix stripped because it's "mine")

// Schema defines unprefixed keys
validateSearch: z.object({
  tab: z.enum(['profile', 'settings']),
})
```

**Pros:**

- Clean destructuring for the common case
- Consistent with current search merging behavior
- Slot code is portable (no hardcoded slot name)

**Cons:**

- Name collisions if parent and slot both define `tab`
- "Magic" prefix stripping
- Need to define collision behavior

**Collision handling options:**

- Slot wins (shadows parent)
- Error at build time if schemas conflict
- Both available under different keys somehow

#### Option B: Separate Hooks for Slot vs Inherited Search

```ts
// Inside @modal/users.$id.tsx
const { tab } = Route.useSearch() // only MY slot's params: { tab }
const { filter } = Route.useInheritedSearch() // parent params: { filter }

// Or combined with explicit separation:
const { tab } = Route.useSearch()
const { filter } = useSearch({ from: '/dashboard' })
```

**Pros:**

- No collision possible
- Explicit about what you're accessing
- Slot's own search is clean

**Cons:**

- Breaks from current "merged search" pattern
- Two calls to get all available search params

#### Option C: Nested Structure

```ts
// Inside @modal/users.$id.tsx
const search = Route.useSearch()
// {
//   filter: 'active',           // parent's
//   modal: { tab: 'profile' }   // slot's, under clean key
// }

const {
  filter,
  modal: { tab },
} = search
```

**Pros:**

- Clear structure, no collisions
- Single hook call
- JS-friendly keys (no `@` or `.` in property names)

**Cons:**

- Different structure than current flat search
- Deeper nesting for nested slots
- Schema definition would need to match this structure?

#### Option D: Transform Keys to JS-Friendly Format

URL uses `@modal.tab`, but internally transform to JS-friendly keys:

```ts
// URL: ?@modal.tab=profile
// Internally: { modal_tab: 'profile' } or { modalTab: 'profile' }

const { filter, modal_tab } = Route.useSearch()
// or
const { filter, modalTab } = Route.useSearch()
```

**Pros:**

- Flat structure like today
- Valid JS identifiers

**Cons:**

- Disconnect between URL and code
- Naming convention feels arbitrary
- Nested slots get ugly: `modal_confirm_action`

---

**Current leaning:** Option A (strip prefix for own params) or Option C (nested structure) seem most promising. Option A is closest to current behavior but has collision concerns. Option C is cleanest but changes the search shape.

This needs more research and community input before deciding.

### Accessing Parent Route Search from Slots

Slots are children of routes, so a slot component might need access to both:

1. Its own search params (e.g., `@modal.tab`)
2. Its parent route's search params (e.g., `filter` on `/dashboard`)

```ts
// URL: /dashboard?filter=active&@modal=/users/123&@modal.tab=profile

// dashboard.tsx defines:
validateSearch: z.object({ filter: z.string() })

// @modal/users.$id.tsx defines:
validateSearch: z.object({ tab: z.enum(['profile', 'settings']) })
```

**Inside the modal component, how do you access both?**

```ts
// @modal/users.$id.tsx
function UserModal() {
  // Slot's own search - however we decide to expose it
  const { tab } = Route.useSearch() // or Route.useSlotSearch(), etc.

  // Parent route's search - use from to specify which route
  const { filter } = useSearch({ from: '/dashboard' })

  // Or access root's search
  const rootSearch = useSearch({ from: '/' })
}
```

This works because `useSearch({ from })` already lets you read any route's search params. The open question is only about how the slot accesses _its own_ params.

### Conflict Handling

What if both the slot and parent define `tab`?

```ts
// dashboard.tsx
validateSearch: z.object({ tab: z.string() }) // ?tab=overview

// @modal/users.$id.tsx
validateSearch: z.object({ tab: z.string() }) // ?@modal.tab=profile
```

**URL:** `/dashboard?tab=overview&@modal=/users/123&@modal.tab=profile`

These don't actually conflict in the URL because slot params are prefixed. The question is what `Route.useSearch()` returns inside the slot:

1. **Slot's own params only** - `{ tab: 'profile' }` (from `@modal.tab`)
2. **Merged with parent** - `{ tab: 'profile' }` (slot shadows parent)
3. **Error** - Can't have same key in slot and parent schemas

**Recommendation:** Option 1 - `Route.useSearch()` inside a slot returns only that slot's search params. Use `useSearch({ from: '/dashboard' })` to explicitly access parent params. This is consistent with how nested routes work today.

---

## Slot Lifecycle

### Persistence

Slot state is stored in URL search params. This means:

- Refresh preserves slot state
- Back/forward navigation works
- Sharing URL shares complete state
- SSR renders slots correctly

### Automatic Slot Param Persistence

**Important:** Normal search params are not automatically preserved during navigation - you typically need a search param filter/persister. However, **slot search params are treated specially** and automatically persist across navigations within the same slot hierarchy.

```ts
// URL: /dashboard?@modal=/users/123&@modal.tab=profile

// Navigate main route - slot params automatically preserved
navigate({ to: '/settings' })
// Result: /settings?@modal=/users/123&@modal.tab=profile

// Explicitly close modal
navigate({ to: '/settings', slots: { modal: null } })
// Result: /settings (slot params removed)
```

### When Slot State is Lost

Slot state is lost when navigating away from a route that owns the slot:

```ts
// @activity is scoped to /dashboard
// URL: /dashboard?@activity=/recent

// Navigate away from dashboard - @activity slot no longer exists
navigate({ to: '/settings' })
// Result: /settings (no @activity params - that slot doesn't exist here)

// Navigate back to dashboard - slot state is gone
navigate({ to: '/dashboard' })
// Result: /dashboard (starts fresh, @activity at default)

// BUT: the previous state is still in browser history
// Pressing "back" restores: /dashboard?@activity=/recent
```

### Root Slots vs Scoped Slots

**Root slots** (defined on `__root`) persist across all navigation since root is always active:

```ts
// @modal is on root - persists everywhere
/dashboard?@modal=/users/123
/settings?@modal=/users/123   // still there
/products?@modal=/users/123   // still there
```

**Scoped slots** (defined on specific routes) only exist when that route is active:

```ts
// @activity is scoped to /dashboard
;/dashboard?@activity=/ceenrt / // exists
  settings / // @activity gone (dashboard not active)
  dashboard // @activity starts fresh
```

---

## Nested Slots (Slots Within Slots)

Slots can have their own nested slots. Like all slots, nested slots are defined via files - the parent slot discovers them after composition and gains type-safe access.

```
routes/
├── @modal.tsx                 # modal slot root
├── @modal.settings.tsx        # modal route
├── @modal.@confirm.tsx        # nested slot root (child of @modal)
├── @modal.@confirm.delete.tsx # nested slot route
└── @modal.@confirm.discard.tsx
```

```ts
// @modal.tsx - doesn't declare slots, discovers @confirm after composition
export const Route = createSlotRootRoute({
  component: ModalWrapper,
})

function ModalWrapper() {
  return (
    <div className="modal">
      <Outlet />
      {/* Type-safe: Route.Outlet knows about @confirm from composition */}
      <Route.Outlet slot="confirm" />
    </div>
  )
}
```

### Nested Slot URL Structure

Prefixes nest using `@`:

```
?@modal=/users/123&@modal@confirm=/delete
                   ^^^^^^^^^^^^^^^^^^^^^
                   nested slot within modal
```

### Navigation to Nested Slots

```ts
// From within the modal - navigate the nested confirm slot
navigate({
  slots: {
    modal: {
      slots: {
        confirm: { to: '/delete' },
      },
    },
  },
})

// Navigate modal AND its nested confirm slot together
navigate({
  slots: {
    modal: {
      to: '/users/$id',
      params: { id: '123' },
      slots: {
        confirm: { to: '/delete' },
      },
    },
  },
})
```

---

## Error Boundaries

Each slot has independent error handling. A slot error doesn't affect other slots or the main route.

```ts
// @modal/users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  loader: fetchUser,
  component: UserModal,
  errorComponent: UserModalError,
})

function UserModalError({ error }) {
  return (
    <div className="modal-error">
      <h2>Failed to load user</h2>
      <p>{error.message}</p>
      <button onClick={() => router.navigate({ slot: 'modal', to: null })}>
        Close
      </button>
    </div>
  )
}
```

### Error Isolation

```
Main route: /dashboard (renders fine)
├── @activity slot (renders fine)
├── @metrics slot (loader throws error)
│   └── Shows MetricsError component
└── @modal slot (renders fine)
```

The metrics error doesn't crash the dashboard or other slots.

---

## Streaming / Suspense

Slot routes are regular routes with standard route config options. Each slot can handle its own loading and error states:

```ts
// @modal.tsx
export const Route = createSlotRootRoute({
  component: ModalWrapper,
  pendingComponent: ModalSkeleton,
  errorComponent: ModalError,
})

// @modal/users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  loader: fetchUser,
  component: UserModal,
  pendingComponent: UserModalSkeleton,
  errorComponent: UserModalError,
})
```

Each slot suspends independently - a slow loader in `@modal` doesn't block `@activity` from rendering.

### SSR Streaming

On SSR, slots stream independently as their data resolves:

1. Shell HTML sent immediately
2. Main route streams when ready
3. Each slot streams independently when its data resolves
4. Client hydrates progressively

This enables:

- Fast initial paint
- Progressive enhancement
- No blocking on slowest loader

---

## Type Safety

Full type inference throughout the system.

### Slot Outlet

```tsx
// ✅ Valid - modal slot exists on root
<Route.Outlet slot="modal" />

// ❌ Type error - slot doesn't exist
<Route.Outlet slot="nonexistent" />

// With explicit from
<Outlet from="/" slot="modal" />           // ✅ Valid
<Outlet from="/dashboard" slot="activity" /> // ✅ Valid
<Outlet from="/settings" slot="activity" /> // ❌ Type error - activity not on /settings
```

### Slot Navigation

```ts
// Given modal has routes: /, /users/$id, /settings

// ✅ Valid
navigate({ slots: { modal: { to: '/users/$id', params: { id: '123' } } } })

// ❌ Type error - route doesn't exist
navigate({ slots: { modal: { to: '/invalid' } } })

// ❌ Type error - missing required param
navigate({ slots: { modal: { to: '/users/$id' } } })

// ❌ Type error - slot doesn't exist on current route
navigate({ slots: { invalid: { to: '/' } } })
```

### Slot Search Params

```ts
// Given modal's /users/$id route has search schema { tab: 'profile' | 'settings' }

// ✅ Valid
navigate({
  slots: {
    modal: {
      to: '/users/$id',
      params: { id: '123' },
      search: { tab: 'profile' },
    },
  },
})

// ❌ Type error - invalid tab value
navigate({
  slots: {
    modal: {
      to: '/users/$id',
      params: { id: '123' },
      search: { tab: 'invalid' },
    },
  },
})
```

---

## Examples

See the [examples/](./examples/) directory for complete file structure examples:

1. **[modal-with-navigation](./examples/modal-with-navigation/)** - Global modal slot with internal navigation
2. **[dashboard-widgets](./examples/dashboard-widgets/)** - Route-scoped slots for parallel-loading widgets (explicit placement)
3. **[component-routes](./examples/component-routes/)** - Auto-rendering widget slots with `<Route.Slots>` iteration and conditional `enabled`
4. **[split-pane-mail](./examples/split-pane-mail/)** - Email client with independently navigable panes
5. **[nested-slots](./examples/nested-slots/)** - Modal with a nested confirmation dialog slot

---

## Migration Path

This is an additive feature with no breaking changes to existing apps.

### Incremental Adoption

1. **Create the slot's route files**

   ```
   routes/
     @modal.tsx              # slot root
     @modal.users.$id.tsx    # slot child route
   ```

   The slot is automatically discovered and wired to its parent route (`__root` in this case) during route generation.

2. **Render the slot with Outlet** (in `__root.tsx` or wherever the slot should appear)

   ```tsx
   <Route.Outlet slot="modal" />
   ```

3. **Navigate to slots using Link or useNavigate**

   ```tsx
   // Using Route.Link (from is implicit)
   <Route.Link slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>
     Open User
   </Route.Link>

   // Or with explicit from
   <Link from="/" slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>
     Open User
   </Link>
   ```

Existing routes, loaders, and components continue to work unchanged.

---

## Comparison to Other Frameworks

| Aspect                | TanStack Router      | Next.js                  | Remix (Proposed)    |
| --------------------- | -------------------- | ------------------------ | ------------------- |
| URL persisted         | Yes (search params)  | No (memory)              | No                  |
| Survives refresh      | Yes                  | No (default.js fallback) | N/A                 |
| Shareable URL         | Yes                  | No                       | N/A                 |
| SSR compatible        | Yes (native)         | Partial                  | N/A                 |
| Type-safe             | Yes (full inference) | No                       | N/A                 |
| Parallel loaders      | Yes                  | N/A (RSC model)          | Proposed            |
| Independent streaming | Yes                  | Yes                      | N/A                 |
| File convention       | @slotName            | @folder                  | @sibling (proposed) |
| Nested slots          | Yes                  | Yes                      | No                  |
| Slot search params    | Yes (namespaced)     | No                       | No                  |

### Key Differentiator

TanStack Router is the only framework where parallel routes are truly URL-first. The URL contains complete application state, enabling:

- **Sharing**: Send someone a URL with exact modal/drawer state
- **Bookmarking**: Save the complete UI state
- **SSR**: Server renders correct slot state on first request
- **History**: Back/forward works naturally
- **Testing**: Deterministic URLs for e2e tests

---

## Summary of Design Decisions

| Aspect             | Decision                                                     |
| ------------------ | ------------------------------------------------------------ |
| URL prefix         | `@` (configurable via `slotPrefix`)                          |
| File convention    | `@slotName` prefix, follows existing flat/directory patterns |
| Slot definition    | Isolated files - no parent declaration needed, auto-composed |
| Slot root file     | `@modal.tsx` or `@modal/route.tsx`                           |
| Default behavior   | Slots render by default when parent matches                  |
| URL for root path  | Not needed - only deviations from default appear in URL      |
| Disable syntax     | `@slotName=false` to explicitly hide a slot                  |
| Close syntax       | `to: null`                                                   |
| Conditional render | `enabled` function opts OUT of default rendering             |
| Slot metadata      | Use `staticData` (type-safe via module declaration)          |
| Search params      | Namespaced in URL: `@modal.tab=profile` (access pattern TBD) |
| Nested slots       | Supported with nested prefix: `@modal@confirm`               |
| Loader execution   | Parallel with main route                                     |
| beforeLoad         | Serial (same as regular routes)                              |
| Suspense           | Independent per slot                                         |
| Error boundaries   | Independent per slot                                         |
| Slot preservation  | Preserved on main route navigation by default                |

---

## Open Questions for Implementation

1. **Search param access within slots**: How should slot components access their namespaced search params? See detailed options in the [Search Params](#open-question-search-param-access-within-slots) section. This affects DX significantly and needs community input.

2. **Preloading**: How should `<Link slots={{ modal: {...} }} preload="intent">` work? Should it preload just the slot's route, or also affect main route preloading?

3. **shouldRevalidate**: Should slots participate in the main route's revalidation cycle, or have completely independent revalidation?

4. **Devtools**: How should the devtools visualize parallel slots? Separate trees? Merged view?

5. **Code splitting**: Should slot route trees be lazy-loadable independently of the routes that render them?

6. **Testing utilities**: What test helpers are needed for testing slot navigation?

---

## References

- [Next.js Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)
- [Remix Sibling Routes Proposal (Discussion #5431)](https://github.com/remix-run/remix/discussions/5431)
- [Jamie Kyle's Slots Tweet](https://twitter.com/buildsghost/status/1531754246856527872)
- [React Router Named Outlets (historical)](https://github.com/remix-run/react-router/discussions/8023)
