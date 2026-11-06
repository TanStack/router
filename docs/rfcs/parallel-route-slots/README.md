# RFC: Parallel Route Slots

**Status:** Draft  
**Author:** Tanner Linsley  
**Created:** 2026-01-04

---

## Overview

**Parallel Route Slots** enable rendering multiple independent route trees simultaneously, with each slot's state persisted in the URL via search parameters. This provides shareable, bookmarkable, SSR-compatible parallel routing.

---

## Motivation

Complex UIs require multiple independent navigable areas: modals with internal navigation, drawers with route hierarchies, split-pane layouts, dashboard widgets loading in parallel.

Current solutions fall short:

| Framework | URL Persisted? | Survives Refresh? | Shareable? |
| --------- | -------------- | ----------------- | ---------- |
| Next.js   | No (memory)    | No (default.js)   | No         |
| Remix     | N/A            | N/A               | N/A        |
| Others    | N/A            | N/A               | N/A        |

**The solution:** Persist slot state in search parameters:

```
/dashboard?@modal=/users/123&@modal.tab=profile&@drawer=/notifications
```

This gives us: shareable URLs, bookmarkable state, SSR compatibility, refresh safety, type safety, and natural browser history.

---

## Design Principles

1. **URL is source of truth** - Slot state lives in search params, not memory
2. **Slots are route trees** - Same mental model as regular routes
3. **Parallel execution** - Slot loaders run in parallel with main route
4. **Independent streaming** - Each slot suspends independently
5. **Type-safe** - Full TypeScript inference
6. **Progressive adoption** - Additive, no breaking changes

---

## URL Structure

Slots render by default when their parent matches. URL only stores deviations:

```
/dashboard                           # all slots at root
/dashboard?@activity=/recent         # activity navigated away from root
/dashboard?@modal=/users/123         # modal opened
/dashboard?@metrics=false            # metrics explicitly disabled
```

### Syntax

```
?@modal=/users/123           # slot at path
?@modal.tab=profile          # slot search param
?@modal=false                # slot disabled
```

Slot search params use dot notation. Inside slot components, access as `tab` (prefix stripped).

### Configuration

```ts
createRouter({
  slotPrefix: '@', // default, configurable
})
```

---

## File Convention

Slots use `@slotName` prefix. Both flat and directory styles work:

```
routes/
├── __root.tsx
├── @modal.tsx                    # global slot (child of root)
├── @modal.users.$id.tsx          # slot route
├── dashboard.tsx
├── dashboard.@activity.tsx       # scoped slot (child of dashboard)
└── dashboard.@activity.index.tsx
```

Or directory style:

```
routes/
├── @modal/
│   ├── route.tsx
│   └── users.$id.tsx
└── dashboard/
    ├── route.tsx
    └── @activity/
        └── route.tsx
```

The generator detects `@slotName` files, associates them with parent routes, and wires composition automatically. Parents discover their slots after composition and gain type-safe access.

### Same-Name Slots

Multiple slots can share a name if they can't match simultaneously at the same nesting level:

```
routes/
├── dashboard.@widget.tsx      # dashboard's widget slot
├── orders.@widget.tsx         # orders' widget slot (different parent, OK)
├── @left.@sidebar.tsx         # nested under @left (OK)
└── @right.@sidebar.tsx        # nested under @right (OK)
```

Disallowed: two `@widget` slots on the same parent route.

---

## Slot Routes

Slot routes use `createSlotRoute` with standard route options:

```ts
// @modal.users.$id.tsx
export const Route = createSlotRoute({
  path: '/users/$id',
  validateSearch: z.object({
    tab: z.enum(['profile', 'settings']).default('profile'),
  }),
  loader: ({ params }) => fetchUser(params.id),
  component: UserModal,
  pendingComponent: UserModalSkeleton,
  errorComponent: UserModalError,
})
```

### Conditional Slots

Use `enabled` to conditionally disable default rendering:

```ts
// dashboard.@adminPanel.tsx
export const Route = createSlotRoute({
  enabled: ({ context }) => context.user.role === 'admin',
  loader: () => fetchAdminStats(),
  component: AdminPanel,
})
```

### Slot Metadata

Use `staticData` for filtering/grouping:

```ts
export const Route = createSlotRoute({
  staticData: {
    area: 'sidebar',
    priority: 1,
  },
  component: ActivityWidget,
})
```

---

## Navigation API

Two ways to navigate slots:

### 1. Fully Qualified `to`

Navigate directly to a slot route using its full path:

```tsx
// Root-level modal
<Link to="/@modal/users/$id" params={{ id: '123' }}>Open User</Link>

// Dashboard-scoped activity
<Link to="/dashboard/@activity/recent">Recent Activity</Link>

// Programmatic
navigate({ to: '/@modal/users/$id', params: { id: '123' } })
```

This works with all existing APIs - same as navigating to any route.

### 2. `slots` Object (Multi-Slot Navigation)

For navigating multiple slots atomically, or combining main route + slot navigation:

```tsx
// Navigate main route AND open modal
<Link to="/dashboard" slots={{ modal: { to: '/users/$id', params: { id: '123' } } }}>

// Update multiple slots at once
<Link from="/dashboard" slots={{
  activity: { to: '/recent' },
  metrics: { search: { range: '7d' } },
}}>

// Close a slot
<Link from="/dashboard" slots={{ modal: null }}>
```

The `to` inside `slots` is relative to that slot's route tree.

### Slot Navigation Options

| Action          | Fully Qualified                 | slots Object                                                  |
| --------------- | ------------------------------- | ------------------------------------------------------------- |
| Open to path    | `to: '/@modal/users/$id'`       | `slots: { modal: { to: '/users/$id' } }`                      |
| Open to root    | `to: '/@modal'`                 | `slots: { modal: {} }`                                        |
| Update search   | (use slots)                     | `slots: { modal: { search: {...} } }`                         |
| Close           | (use slots)                     | `slots: { modal: null }`                                      |
| Disable default | (use slots)                     | `slots: { modal: false }`                                     |
| Nested slots    | `to: '/@modal/@confirm/delete'` | `slots: { modal: { slots: { confirm: { to: '/delete' } } } }` |

### Shallow Merge

With `slots` object, unmentioned slots are preserved:

```tsx
// URL: /dashboard?@modal=/users/123&@activity=/feed

<Link from="/dashboard" slots={{ modal: { to: '/settings' } }}>
// Result: /dashboard?@modal=/settings&@activity=/feed

<Link to="/settings">  // main route only, slots preserved
// Result: /settings?@modal=/users/123&@activity=/feed

// Fully qualified also preserves other slots
<Link to="/@modal/settings">
// Result: /dashboard?@modal=/settings&@activity=/feed
```

---

## Rendering API

Render slots using `Outlet` with a `slot` prop:

```tsx
function RootComponent() {
  return (
    <>
      <Outlet /> {/* regular children */}
      <Route.Outlet slot="modal" />
      <Outlet from="/" slot="drawer" fallback={null} />
    </>
  )
}
```

### Accessing Slot State

Slot routes have fully qualified paths that include their parent context:

```
Root slot:       /@modal/users/$id       (modal on root)
Scoped slot:     /dashboard/@activity    (activity scoped to dashboard)
Nested slot:     /@modal/@confirm/delete (confirm nested in modal)
```

Use these paths with existing hooks:

```ts
// Root-level modal
const modalMatch = useMatch({ from: '/@modal/users/$id', shouldThrow: false })
const userData = useLoaderData({ from: '/@modal/users/$id' })

// Dashboard-scoped activity slot
const activityData = useLoaderData({ from: '/dashboard/@activity' })
```

Inside slot components, use `Route.*` hooks normally:

```tsx
function UserModal() {
  const { user } = Route.useLoaderData()
  const { tab } = Route.useSearch()
  const { id } = Route.useParams()
}
```

`getRouteApi` works with the same fully qualified paths:

```ts
const modalApi = getRouteApi('/@modal/users/$id')
const activityApi = getRouteApi('/dashboard/@activity')

function SomeComponent() {
  const { user } = modalApi.useLoaderData()
  const feed = activityApi.useLoaderData()
}
```

### Iterating Slots

Parent routes can iterate over slots dynamically:

```tsx
function Dashboard() {
  return (
    <Route.Slots>
      {(slots) => (
        <>
          {slots
            .filter((s) => s.staticData?.area === 'sidebar')
            .sort(
              (a, b) =>
                (a.staticData?.priority ?? 0) - (b.staticData?.priority ?? 0),
            )
            .map((slot) => (
              <slot.Outlet key={slot.name} />
            ))}
        </>
      )}
    </Route.Slots>
  )
}
```

Each slot provides:

```ts
interface SlotRenderInfo {
  name: string
  staticData: StaticDataRouteOption
  isOpen: boolean
  path: string | null
  matches: RouteMatch[]
  Outlet: ComponentType
}
```

---

## Loader Execution

### Two Phases

1. **beforeLoad** - Serial down tree, parallel across branches (slots branch from parent)
2. **loader** - All run in parallel after all beforeLoads complete

```
__root.beforeLoad()
         ↓
    ┌────┴────┐
    ↓         ↓
dashboard   @modal.beforeLoad()  ← parallel after root
.beforeLoad()    ↓
    ↓       @modal/users.$id.beforeLoad()
@activity.beforeLoad()

         ↓ All beforeLoads complete ↓

All loaders in parallel:
├── dashboard.loader()
├── @modal/users.$id.loader()
├── @activity/index.loader()
└── ...
```

Slots can have `beforeLoad` for auth/guards. When multiple slots throw redirects, the first to throw wins (same as nested routes):

```ts
export const Route = createSlotRoute({
  beforeLoad: async ({ params }) => {
    if (!(await checkPermission(params.id))) {
      throw redirect({ slots: { modal: { to: '/unauthorized' } } })
    }
  },
})
```

---

## Search Params

Each slot defines its own search schema. Params are namespaced in URL (`@modal.tab=profile`) but accessed without prefix inside the slot.

```ts
// @modal/users.$id.tsx
export const Route = createSlotRoute({
  validateSearch: z.object({
    tab: z.enum(['profile', 'settings']).default('profile'),
  }),
})

function UserModal() {
  const { tab } = Route.useSearch() // just 'tab', not '@modal.tab'
  const { filter } = useSearch({ from: '/dashboard' }) // parent's params
}
```

### Collision Handling

If slot and parent both define `tab`:

- URL: `?tab=overview&@modal.tab=profile` (no conflict - prefixed)
- `Route.useSearch()` inside slot returns slot's value (shadows parent)
- Use `useSearch({ from: '/dashboard' })` for explicit parent access

---

## Slot Lifecycle

### Persistence

Slot params automatically persist across navigations (unlike normal search params):

```ts
// URL: /dashboard?@modal=/users/123
navigate({ to: '/settings' })
// Result: /settings?@modal=/users/123 (preserved)

navigate({ to: '/settings', slots: { modal: null } })
// Result: /settings (explicitly closed)
```

### Scoped vs Root Slots

**Root slots** (on `__root`) persist everywhere. **Scoped slots** only exist when their parent is active:

```
// @activity scoped to /dashboard
/dashboard?@activity=/recent  // exists
/settings                      // @activity gone
/dashboard                     // @activity starts fresh (but history preserved)
```

---

## Nested Slots

Slots can contain slots:

```
routes/
├── @modal.tsx
├── @modal.@confirm.tsx        # nested slot
└── @modal.@confirm.delete.tsx
```

URL uses nested prefix:

```
?@modal=/settings&@modal@confirm=/delete
```

Navigate with fully qualified path or nested `slots` object:

```ts
// Fully qualified - simpler for direct navigation
navigate({ to: '/@modal/@confirm/delete' })

// slots object - for multi-slot or combined navigation
navigate({
  slots: {
    modal: {
      to: '/settings',
      slots: { confirm: { to: '/delete' } },
    },
  },
})
```

---

## Error Boundaries & Streaming

Each slot has independent error handling and suspense. A slot error doesn't crash other slots or the main route.

```ts
export const Route = createSlotRoute({
  component: UserModal,
  pendingComponent: UserModalSkeleton,
  errorComponent: UserModalError,
})
```

SSR streams each slot independently as data resolves.

---

## Type Safety

Full inference throughout:

```tsx
// ✅ Valid - fully qualified
<Link to="/@modal/users/$id" params={{ id: '123' }}>
<Link to="/dashboard/@activity/recent">
navigate({ to: '/@modal/users/$id', params: { id: '123' } })

// ✅ Valid - slots object
<Route.Outlet slot="modal" />
<Link from="/dashboard" slots={{ activity: { to: '/recent' } }}>

// ❌ Type errors
<Route.Outlet slot="nonexistent" />
<Link to="/@modal/users/$id">  // missing required param
<Link from="/settings" slots={{ activity: { to: '/recent' } }}>  // activity not on /settings
```

---

## Examples

See [examples/](./examples/) for complete implementations:

1. **[modal-with-navigation](./examples/modal-with-navigation/)** - Global modal with internal navigation
2. **[dashboard-widgets](./examples/dashboard-widgets/)** - Parallel-loading widgets with explicit placement
3. **[component-routes](./examples/component-routes/)** - Auto-rendering with `<Route.Slots>` iteration
4. **[split-pane-mail](./examples/split-pane-mail/)** - Independent pane navigation
5. **[nested-slots](./examples/nested-slots/)** - Modal with nested confirmation dialog

---

## Migration

Additive feature, no breaking changes:

1. Create `@slotName` files
2. Render with `<Route.Outlet slot="name" />`
3. Navigate with `<Link to="/@slotName/path">` or `slots: { name: {...} }`

---

## Open Questions

1. **Devtools** - How to visualize parallel slot trees?

2. **Testing utilities** - What helpers are needed for slot navigation testing?

## Resolved Questions

1. **Preloading** - Slots follow the same preloading behavior as nested routes. `preload="intent"` preloads all matched routes including slots.

2. **Revalidation** - Slots participate in revalidation the same way nested routes do today.

3. **`.lazy()` support** - Slot routes support `.lazy()` for code splitting, same as regular routes. Critical for monorepo support where route definitions are separate from components.

---

## References

- [Next.js Parallel Routes](https://nextjs.org/docs/app/building-your-application/routing/parallel-routes)
- [Remix Sibling Routes Proposal](https://github.com/remix-run/remix/discussions/5431)
- [Jamie Kyle's Slots Tweet](https://twitter.com/buildsghost/status/1531754246856527872)
