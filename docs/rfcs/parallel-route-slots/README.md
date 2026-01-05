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
        {/* Type-safe: Route knows about @modal from composition */}
        <Route.SlotOutlet name="modal" />
        <Route.SlotOutlet name="drawer" />
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
        {/* Type-safe: Route knows about @activity from composition */}
        <Route.SlotOutlet name="activity" />
      </aside>
      <main>
        <Outlet />
      </main>
      <aside>
        <Route.SlotOutlet name="metrics" />
        <Route.SlotOutlet name="quickActions" />
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
4. Augments parent route types so `Route.SlotOutlet`, `Route.Slots`, etc. are type-safe

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

### Core Principle: Slots Are Scoped to Routes

Slots are defined on specific routes (root or otherwise). You can only navigate a slot if you're also navigating to (or already at) a route that renders that slot. This ensures type safety and prevents navigating to slots that won't be rendered.

### Simple API: SlotRoute.navigate() and SlotRoute.Link

The simplest way to navigate a slot is through the slot route's own navigation methods. These are type-safe and ensure the parent route hierarchy is valid:

```ts
// Import the slot route (generated)
import { modalRoute } from './routeTree.gen'

// Navigate the modal slot
modalRoute.navigate({
  to: '/users/$id',
  params: { id: '123' },
  search: { tab: 'profile' },
})

// Navigate to slot root
modalRoute.navigate({ to: '/' })
// or just
modalRoute.navigate({})

// Close the slot
modalRoute.navigate({ to: null })

// Update just search params (preserve current path)
modalRoute.navigate({ search: { tab: 'settings' } })
```

### SlotRoute.Link Component

```tsx
import { modalRoute } from './routeTree.gen'

// Open modal to specific route
<modalRoute.Link to="/users/$id" params={{ id: '123' }}>
  View User
</modalRoute.Link>

// Open modal to root
<modalRoute.Link>
  Open Modal
</modalRoute.Link>

// Close modal
<modalRoute.Link to={null}>
  Close
</modalRoute.Link>

// Update search only
<modalRoute.Link search={{ tab: 'profile' }}>
  Profile Tab
</modalRoute.Link>
```

### Within-Slot Navigation

When you're inside a slot component, regular `Link` and `navigate` work within that slot's context:

```tsx
// Inside @modal/users.$id.tsx
function UserModal() {
  return (
    <div>
      {/* These navigate within the modal slot */}
      <Link to="/settings">Settings</Link>
      <Link to="/users/$id" params={{ id: '456' }}>
        Other User
      </Link>

      {/* Close the modal */}
      <Link to={null}>Close</Link>
    </div>
  )
}
```

### Advanced: Atomic Multi-Slot Navigation

For navigating multiple slots atomically (or combining with main route navigation), use the `slots` property:

```ts
// Navigate to dashboard and update multiple slots atomically
router.navigate({
  to: '/dashboard',
  slots: {
    activity: { to: '/recent' },
    metrics: { search: { range: '7d' } },
    modal: null, // close modal
  },
})
```

This is useful when you need to:

- Navigate main route + slots in one atomic update
- Update multiple slots at once
- Ensure consistency between route and slot state

### Shallow Updates (Default Behavior)

Like params, slots use **shallow merging** by default - unmentioned slots are preserved:

```ts
// Current URL: /dashboard?@activity=/feed&@metrics.range=30d&@modal=/settings

// Update just activity - others preserved
activityRoute.navigate({ to: '/recent' })
// Result: /dashboard?@activity=/recent&@metrics.range=30d&@modal=/settings

// Or via slots object
router.navigate({
  slots: { activity: { to: '/recent' } },
})
```

### Close vs Disable

```ts
// Close - removes slot from URL entirely
modalRoute.navigate({ to: null })
// or
router.navigate({ slots: { modal: null } })

// Disable - for slots that render by default, explicitly hide
router.navigate({ slots: { notifications: false } })
// Adds @notifications=false to URL
```

### Route-Scoped Slot Type Safety

Slots scoped to specific routes enforce that you're on (or navigating to) that route:

```ts
// dashboard.@activity is scoped to /dashboard
import { activityRoute } from './routeTree.gen'

// ✅ Works when on /dashboard
activityRoute.navigate({ to: '/recent' })

// ✅ Works when navigating to /dashboard
router.navigate({
  to: '/dashboard',
  slots: { activity: { to: '/recent' } },
})

// ❌ Type error - activity not available when navigating to /settings
router.navigate({
  to: '/settings',
  slots: { activity: { to: '/recent' } },
})
```

### Nested Slot Navigation

For slots within slots:

```ts
// Modal has a nested @confirm slot
import { modalRoute, modalConfirmRoute } from './routeTree.gen'

// Simple: use the nested slot's route directly
modalConfirmRoute.navigate({ to: '/delete' })

// Advanced: atomic navigation
router.navigate({
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
// URL: ?@modal=/users/123&@modal@confirm=/delete
```

### Type Safety Summary

All navigation is fully typed:

```ts
import { modalRoute } from './routeTree.gen'

// ✅ Valid
modalRoute.navigate({ to: '/users/$id', params: { id: '123' } })

// ❌ Type error - route doesn't exist
modalRoute.navigate({ to: '/nonexistent' })

// ❌ Type error - missing required param
modalRoute.navigate({ to: '/users/$id' })

// ❌ Type error - invalid search param
modalRoute.navigate({
  to: '/users/$id',
  params: { id: '123' },
  search: { invalid: true },
})
```

### API Summary

| Task               | Simple API                         | Advanced API                                       |
| ------------------ | ---------------------------------- | -------------------------------------------------- |
| Navigate slot      | `slotRoute.navigate({ to })`       | `router.navigate({ slots: { name: { to } } })`     |
| Open slot root     | `slotRoute.navigate({})`           | `router.navigate({ slots: { name: {} } })`         |
| Update search only | `slotRoute.navigate({ search })`   | `router.navigate({ slots: { name: { search } } })` |
| Close slot         | `slotRoute.navigate({ to: null })` | `router.navigate({ slots: { name: null } })`       |
| Disable default    | -                                  | `router.navigate({ slots: { name: false } })`      |
| Multi-slot atomic  | -                                  | `router.navigate({ to, slots: {...} })`            |
| Link               | `<slotRoute.Link to={...}>`        | `<Link slots={{...}}>`                             |

---

## Rendering API

### SlotOutlet Component

Render a slot's content. Type-safe based on the route's `slots` definition.

```tsx
// Basic usage
<Route.SlotOutlet name="modal" />

// With fallback when slot is closed
<Route.SlotOutlet name="modal" fallback={null} />
<Route.SlotOutlet name="modal" fallback={<ModalPlaceholder />} />
```

### useSlot Hook

Access slot state and helpers programmatically:

```ts
const modal = useSlot('modal')

// Returns:
{
  isOpen: boolean,              // is the slot currently open?
  path: string | null,          // current path within slot, null if closed
  matches: RouteMatch[],        // slot's route matches
  search: ModalSearchSchema,    // slot's search params (typed)

  // Navigation helpers
  navigate: (opts) => void,     // navigate within this slot
  close: () => void,            // close the slot
}

// Example usage
function ModalTrigger() {
  const modal = useSlot('modal')

  if (modal.isOpen) {
    return <button onClick={modal.close}>Close Modal</button>
  }

  return (
    <button onClick={() => modal.navigate({ to: '/users/$id', params: { id: '123' } })}>
      Open User Modal
    </button>
  )
}
```

### useSlotLoaderData Hook

Access a slot route's loader data from outside the slot:

```ts
// Access modal's current route loader data
const userData = useSlotLoaderData('modal', '/users/$id')
```

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
        <Route.SlotOutlet name="header" />
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

### Parallel Execution

All matched loaders run in parallel - main route, child routes, and all active slot routes:

```
Navigation to /dashboard (with @modal=/users/123 in URL, other slots at default)

Executes in parallel:
├── dashboard.loader()
├── @modal/users.$id.loader()      # modal navigated to /users/123
├── dashboard.@activity.loader()    # renders by default
├── dashboard.@metrics.loader()     # renders by default
└── dashboard.@quickActions.loader() # renders by default
```

This eliminates the waterfall problem. Each "widget" on a dashboard can fetch its own data without blocking others.

### beforeLoad Remains Serial

As with current nested routes, `beforeLoad` runs serially for authentication, redirects, etc.:

```
Serial (beforeLoad):
1. __root.beforeLoad()
2. dashboard.beforeLoad()

Then parallel (loaders):
├── dashboard.loader()
├── @modal/users.$id.loader()
└── dashboard.@activity/index.loader()
```

### Slot beforeLoad

Slots can have their own `beforeLoad` for slot-specific auth/guards:

```ts
// @modal/users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  beforeLoad: async ({ params }) => {
    const canViewUser = await checkPermission(params.id)
    if (!canViewUser) {
      throw redirect({ slot: 'modal', to: '/unauthorized' })
    }
  },
  loader: ({ params }) => fetchUser(params.id),
})
```

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
  const { tab, expanded } = Route.useSearch()
  // tab and expanded are typed and validated
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

**How should slot components access their search params?**

There are several options, each with tradeoffs:

#### Option A: Strip Prefix (Transparent Access)

Inside the slot, access params without the prefix - the router handles namespacing transparently:

```ts
// Inside @modal/users.$id.tsx
const { tab, expanded } = Route.useSearch() // not @modal.tab, just tab

// Schema defines unprefixed keys
validateSearch: z.object({
  tab: z.enum(['profile', 'settings']),
})
```

**Pros:**

- Clean, ergonomic API - feels like regular routes
- Slot code is portable (no hardcoded slot name)
- Schema matches what you access in code

**Cons:**

- "Magic" transformation happening under the hood
- Debugging confusion: URL shows `@modal.tab` but code uses `tab`
- Implementation complexity in router internals

#### Option B: Always Prefixed (Explicit Access)

Slot components always use the full prefixed key:

```ts
// Inside @modal/users.$id.tsx
const { '@modal.tab': tab, '@modal.expanded': expanded } = Route.useSearch()

// Or with a helper
const { tab, expanded } = Route.useSlotSearch()
```

**Pros:**

- What you see in URL is what you use in code
- No magic transformation
- Easier to debug

**Cons:**

- Verbose, especially with destructuring
- Slot code is coupled to its name
- Renaming a slot requires updating component code

#### Option C: Slot-Scoped Hook

Provide a dedicated hook that handles the namespacing:

```ts
// Inside @modal/users.$id.tsx
const { tab, expanded } = Route.useSlotSearch() // knows it's in @modal context

// Regular useSearch still works for accessing parent route search
const { filter } = useSearch({ from: '/dashboard' })
```

**Pros:**

- Clear separation between slot search and parent search
- Explicit about what you're accessing
- Slot code remains portable

**Cons:**

- New API to learn
- Two different hooks for search params

#### Option D: Nested Search Object

Structure the search object to reflect the nesting:

```ts
// Inside @modal/users.$id.tsx
const search = Route.useSearch()
// search = { tab: 'profile', expanded: true } within slot context
// But from parent: search = { filter: 'active', '@modal': { tab: 'profile', ... } }
```

**Pros:**

- Clear structure
- Works well with TypeScript

**Cons:**

- Different shapes depending on where you're reading from
- Complex to type correctly

---

**Current leaning:** Option A (strip prefix) or Option C (dedicated hook) seem most ergonomic, but this needs more research and community input before deciding.

### Conflict Handling

Regardless of which option is chosen, conflicts between slot search keys and parent route search keys need handling. Options:

1. **Error at schema validation** - Conflict is a build/runtime error
2. **Slot always wins** - Slot params shadow parent params within slot context
3. **Explicit namespacing required** - Force users to namespace in their schemas

This is related to the access pattern decision above and should be resolved together.

---

## Slot Lifecycle

### Persistence

Slots persist to the URL by default. This means:

- Refresh preserves slot state
- Back/forward navigation works
- Sharing URL shares complete state
- SSR renders slots correctly

### Slot Preservation on Navigation

When navigating the main route without mentioning slots, slots are **preserved by default** (since they're in search params):

```ts
// Modal stays open when navigating main route
router.navigate({ to: '/settings' })

// Explicitly close modal when navigating
router.navigate({
  to: '/settings',
  slots: { modal: null },
})

// Open a different modal route when navigating
router.navigate({
  to: '/settings',
  slots: { modal: { to: '/confirmation' } },
})
```

### Scoped Slot Behavior

Route-scoped slots (defined on a specific route rather than root) are only rendered when that route is active:

```ts
// dashboard.tsx defines @activity slot
// When navigating away from /dashboard, the @activity slot is not rendered
// But its URL state (@activity or @activity=/path) remains in the URL

// When returning to /dashboard, the slot renders with previous state
router.navigate({ to: '/settings' }) // slot not rendered, but state preserved
router.navigate({ to: '/dashboard' }) // slot renders with previous state
```

---

## Nested Slots (Slots Within Slots)

Slots can define their own slots for complex nested UI:

```ts
// @modal/route.tsx
export const Route = createSlotRootRoute({
  slots: {
    confirm: confirmDialogTree, // nested slot
  },
  component: ModalWrapper,
})

function ModalWrapper() {
  return (
    <div className="modal">
      <Outlet />
      <Route.SlotOutlet name="confirm" />
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
// From within the modal
router.navigate({
  slot: 'confirm',
  to: '/delete',
})

// From outside (fully qualified)
router.navigate({
  slot: 'modal',
  to: '/users/$id',
  params: { id: '123' },
  slots: {
    confirm: { to: '/delete' },
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

Each slot can suspend independently, enabling granular loading states:

```tsx
function RootComponent() {
  return (
    <>
      <Outlet />
      <Suspense fallback={<ModalSkeleton />}>
        <Route.SlotOutlet name="modal" />
      </Suspense>
      <Suspense fallback={<DrawerSkeleton />}>
        <Route.SlotOutlet name="drawer" />
      </Suspense>
    </>
  )
}
```

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

### Slot Names

```tsx
// ✅ Valid - modal slot exists on root
<Route.SlotOutlet name="modal" />

// ❌ Type error - slot doesn't exist
<Route.SlotOutlet name="nonexistent" />
```

### Slot Navigation

```ts
// Given modal has routes: /, /users/$id, /settings

// ✅ Valid
router.navigate({ slot: 'modal', to: '/users/$id', params: { id: '123' } })

// ❌ Type error - route doesn't exist
router.navigate({ slot: 'modal', to: '/invalid' })

// ❌ Type error - missing required param
router.navigate({ slot: 'modal', to: '/users/$id' })

// ❌ Type error - slot doesn't exist
router.navigate({ slot: 'invalid', to: '/' })
```

### Slot Search Params

```ts
// Given modal's /users/$id route has search schema { tab: 'profile' | 'settings' }

// ✅ Valid
router.navigate({
  slot: 'modal',
  to: '/users/$id',
  params: { id: '123' },
  search: { tab: 'profile' },
})

// ❌ Type error - invalid tab value
router.navigate({
  slot: 'modal',
  to: '/users/$id',
  params: { id: '123' },
  search: { tab: 'invalid' },
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

1. **Add a slot to `__root.tsx`**

   ```ts
   export const Route = createRootRoute({
     slots: {
       modal: modalRouteTree,
     },
   })
   ```

2. **Create the slot's route files**

   ```
   routes/
     @modal.tsx
     @modal.users.$id.tsx
   ```

3. **Render the SlotOutlet**

   ```tsx
   <Route.SlotOutlet name="modal" />
   ```

4. **Use the slot route to navigate**

   ```tsx
   import { modalRoute } from './routeTree.gen'

   ;<modalRoute.Link to="/users/$id" params={{ id: '123' }}>
     Open User
   </modalRoute.Link>
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
