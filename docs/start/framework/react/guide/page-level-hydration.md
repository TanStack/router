---
id: page-level-hydration
title: Page-Level Hydration
---

> **Heads up:** this is _not_ React 18's "Selective Hydration" (priority-based subtree hydration driven by user interaction). The feature here lives at a different granularity — it controls **whether** a route hydrates at all, not in what order subtrees come online.

## What is Page-Level Hydration?

In TanStack Start, routes are server-side rendered by default and then "hydrated" on the client — meaning React attaches event handlers and makes the page interactive. The `hydrate` route option gives you **page-level** control: a route either hydrates or it doesn't.

**Note:** This is **page-level** hydration control — the entire page either hydrates or it doesn't. For **component-level** opt-in/opt-out hydration (Server Components), where individual components can opt in or out of hydration, stay tuned for upcoming releases from TanStack Router.

When you set `hydrate: false` on a route:

- ✅ The page is still server-side rendered (SSR) and SEO-friendly
- ✅ All content loads instantly with no JavaScript required
- ✅ External scripts from the `head()` option still work
- ❌ React is not loaded or hydrated (no interactivity)
- ❌ No event handlers or reactive state on the client
- ❌ Navigation to or from this route happens via a full-page reload

**Important:** `hydrate: false` should only be used when you want a truly static page with absolutely no React on the client. Most applications should keep the default `hydrate: true` behavior, even for primarily static content, as you typically need at least some client-side interactivity for navigation, analytics, or other features.

## How does this compare to `ssr: false`?

The `ssr` and `hydrate` options serve different purposes:

| Option        | Controls                               | Use Case                                                                        |
| ------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **`ssr`**     | Server-side rendering and data loading | Control when `beforeLoad`/`loader` run and when components render on the server |
| **`hydrate`** | Client-side React hydration            | Control whether the page becomes interactive after being server-rendered        |

**Common Patterns:**

```tsx
// Full SSR + Hydration (default)
ssr: true, hydrate: true
// ✅ Renders on server ✅ Data loads on server ✅ Interactive on client

// Static server-rendered page (no JavaScript)
ssr: true, hydrate: false
// ✅ Renders on server ✅ Data loads on server ❌ NOT interactive

// Client-only page
ssr: false, hydrate: true
// ❌ Renders on client ❌ Data loads on client ✅ Interactive on client

// This combination doesn't make sense
ssr: false, hydrate: false
// ❌ Nothing renders or works (avoid this)
```

**When to use `hydrate: false`:**

- Truly static pages where you want zero React on the client
- Pages where you're willing to give up client-side navigation and all interactivity
- Print-only views or embedded content
- **Note:** This is a very rare use case — most sites should use `hydrate: true` (default)

**When to use `ssr: false`:**

- Pages using browser-only APIs (localStorage, canvas)
- Client-only routes (user dashboards, admin panels)
- Pages with heavy client-side state

## Configuration

You can control whether a route includes the React hydration bundle using the `hydrate` property. This is an **opt-in/opt-out mechanism**:

- **Not set (undefined)**: The default behavior is to hydrate
- **`hydrate: true`**: Explicitly ensures hydration (useful to override a parent's `hydrate: false`)
- **`hydrate: false`**: Explicitly disables hydration

You can change the default behavior using the `defaultHydrate` option on `createRouter`:

```tsx
// src/router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  // Disable hydration by default; routes can still opt back in with `hydrate: true`
  defaultHydrate: false,
})
```

### Omitting `hydrate` (default behavior)

When you don't specify the `hydrate` option, the route hydrates normally:

```tsx
// src/routes/posts/$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  // hydrate not specified - will use default behavior (hydrate)
  loader: async ({ params }) => {
    return { post: await fetchPost(params.postId) }
  },
  component: PostPage,
})
```

**Result:**

- ✅ Server renders the HTML
- ✅ Loader data is sent to the client
- ✅ React hydrates and attaches event handlers

### Explicitly setting `hydrate: true`

You can explicitly set `hydrate: true` to **ensure** a route is always hydrated, even if a parent or nested route has `hydrate: false`. This is useful for resolving conflicts in the route tree:

```tsx
// Parent route disables hydration
export const Route = createFileRoute('/blog')({
  hydrate: false,
  component: BlogLayout,
})

// Child route explicitly ensures hydration
export const Route = createFileRoute('/blog/interactive')({
  hydrate: true, // Explicitly opt-in to ensure hydration
  component: InteractiveBlogPost,
})
```

**When this creates a conflict:**

- If a route has `hydrate: false` and a child has explicit `hydrate: true`, this creates a conflict
- TanStack Router will **not hydrate** the page (safer default) and log a warning
- You should resolve the conflict by making the hydration settings consistent

**When to explicitly use `hydrate: true`:**

- To document intent that a route must be hydrated
- To override a parent's `hydrate: false` (though this creates a conflict that needs resolution)
- To ensure hydration when `defaultHydrate: false` is set globally

### `hydrate: false`

This disables client-side hydration. The page is server-rendered but React is not loaded:

```tsx
// src/routes/legal/privacy.tsx
export const Route = createFileRoute('/legal/privacy')({
  hydrate: false,
  head: () => ({
    meta: [
      { title: 'Privacy Policy' },
      { name: 'description', content: 'Our privacy policy' },
    ],
    // External scripts still work
    scripts: [{ src: 'https://analytics.example.com/script.js' }],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <div>
      <h1>Privacy Policy</h1>
      <p>Last updated: 2024-01-15</p>
      <p>This is a static page with no JavaScript...</p>
      {/* This button won't work (no event handlers attached) */}
      <button onClick={() => alert('This will not work')}>
        Click me (inactive)
      </button>
    </div>
  )
}
```

**Result:**

- ✅ Server renders the HTML with all content
- ✅ Loader data is used during SSR
- ✅ Meta tags and external scripts are included
- ❌ React is NOT loaded on the client
- ❌ No JavaScript bundle downloaded
- ❌ Event handlers don't work
- ❌ Reactive state and effects don't run

**What gets excluded when `hydrate: false`:**

- The React framework runtime
- TanStack Router client bundle
- Your application code
- Hydration data script (`window.$_TSR`)
- Modulepreload links for JavaScript

**What still works:**

- Server-side rendering
- Loader data (during SSR only)
- Meta tags from `head()`
- External scripts from `head()`
- CSS and stylesheets
- Images and static assets

### Client-side navigation **into** a `hydrate: false` route

`hydrate: false` controls the **initial page load**, not subsequent client-side navigations. Once the app has hydrated on any route, React stays loaded for the lifetime of the tab — there's no way to "un-hydrate" partway through a session. As a result:

- A direct/initial load of a `hydrate: false` route → no JavaScript, no React, plain HTML.
- A client-side navigation (via `<Link>`) into the same route from an already-hydrated page → renders normally, the same as any other route. The `hydrate: false` option is a **no-op** in this case.

If a route truly must be static every time it's visited (e.g. a `/legal/privacy` you want consistently served as plain HTML), reach the route via a full-page navigation:

```tsx
// Force a fresh page load so `hydrate: false` takes effect
<Link to="/legal/privacy" reloadDocument>
  Privacy
</Link>
```

### Adding interactivity with plain JavaScript

React event handlers don't run when `hydrate: false`, but you can still add interactivity by attaching a regular `<script>` via the route's `head()` option. The script is included in the SSR HTML and executes in the browser — no React required.

The pattern that scales well is **event delegation**: bind one listener on `document` that looks at `data-*` attributes on the clicked element. This works regardless of when elements appear in the DOM and keeps the script self-contained.

```tsx
// src/routes/legal/privacy.tsx
export const Route = createFileRoute('/legal/privacy')({
  hydrate: false,
  head: () => ({
    meta: [{ title: 'Privacy Policy' }],
    scripts: [
      {
        children: `
          document.addEventListener('click', (event) => {
            const button = event.target.closest('[data-toggle]')
            if (!button) return
            const targetId = button.getAttribute('aria-controls')
            const target = targetId ? document.getElementById(targetId) : null
            if (!target) return
            const isOpen = button.getAttribute('aria-expanded') === 'true'
            button.setAttribute('aria-expanded', String(!isOpen))
            target.hidden = isOpen
          })
        `,
      },
    ],
  }),
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <div>
      <h1>Privacy Policy</h1>

      {/* React `onClick` would do nothing here — drive the toggle from the
          delegated listener in `head().scripts` above. */}
      <button
        type="button"
        data-toggle
        aria-controls="changelog-panel"
        aria-expanded="false"
      >
        Show changelog
      </button>
      <div id="changelog-panel" hidden>
        <ul>
          <li>2024-01-15: Updated cookie policy</li>
          <li>2023-10-01: Added GDPR section</li>
        </ul>
      </div>
    </div>
  )
}
```

**Guidelines:**

- Keep scripts small and self-contained — they ship inline in the HTML, so anything you'd reach for via npm packages should be loaded with a separate `{ src }` script entry instead.
- Prefer delegated listeners on `document` over per-element handlers. The HTML emitted by React doesn't include event listeners, so attribute-driven (`data-toggle`, `aria-controls`, etc.) selectors are the cleanest hook.
- Read/write DOM attributes directly. Anything you mutate stays mutated until the next navigation.
- For larger amounts of behavior, point a `{ src: '/path/to/widget.js' }` script at a separate file that you build/deploy alongside your app.

## Inheritance

A child route inherits the `hydrate` configuration of its parent. If **any route** in the match has `hydrate: false`, the entire page will not be hydrated:

```tsx
root { hydrate: true }
  blog { hydrate: false }
     $postId { hydrate: true }
```

**Result:**

- The `blog` route sets `hydrate: false`
- Even though `$postId` sets `hydrate: true`, it inherits `false` from its parent
- The entire page will NOT be hydrated

This differs from the `ssr` option, which allows child routes to be "more restrictive" than their parents. With `hydrate`, if any route in the tree has `hydrate: false`, the entire match is treated as non-hydrated.

**Why this design?**

Hydration is an all-or-nothing operation for the entire page. You can't hydrate part of a component tree without hydrating its ancestors. This ensures:

- ✅ Predictable behavior
- ✅ No partial hydration issues
- ✅ Clear mental model

## Combining with `ssr` Options

You can combine `ssr` and `hydrate` options for different behaviors:

### Static Content Page (Server-Rendered, No JavaScript)

Perfect for SEO-focused content that doesn't need interactivity:

```tsx
export const Route = createFileRoute('/blog/$slug')({
  ssr: true, // Render on server
  hydrate: false, // Don't load React on client
  loader: async ({ params }) => {
    return { post: await fetchPost(params.slug) }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData.post.title },
      { name: 'description', content: loaderData.post.excerpt },
    ],
  }),
  component: BlogPost,
})
```

**Benefits:**

- ⚡ Fastest possible page load (no JavaScript)
- 🔍 Perfect SEO (fully rendered HTML)
- 📦 Smallest possible bundle size

### Client-Only Interactive Page

For pages that need browser APIs:

```tsx
export const Route = createFileRoute('/dashboard')({
  ssr: false, // Don't render on server (needs browser APIs)
  hydrate: true, // Load React and make interactive
  loader: () => {
    // Runs only on client
    return { user: getUserFromLocalStorage() }
  },
  component: Dashboard,
})
```

### Hybrid: Server Data, Client Rendering

Load data on server but render on client (useful for heavy visualizations):

```tsx
export const Route = createFileRoute('/reports/$id')({
  ssr: 'data-only', // Load data on server, but don't render
  hydrate: true, // Hydrate and render on client
  loader: async ({ params }) => {
    // Runs on server during SSR
    return { report: await fetchReport(params.id) }
  },
  component: ReportVisualization, // Renders only on client
})
```

## Conflict Detection

The `hydrate` option is an **opt-in/opt-out mechanism**. Conflicts occur when:

- Some routes explicitly set `hydrate: false` (opt-out)
- Other routes explicitly set `hydrate: true` (opt-in to ensure hydration)

**Note:** Routes that don't specify `hydrate` (using the default behavior) do not create conflicts.

When TanStack Start detects conflicting explicit settings:

1. **Does not hydrate the page** (safer default - respects the `false` setting)
2. **Logs a warning** to help you debug:

```text
[TanStack Router] Conflicting `hydrate` options detected in route matches:
some routes set `hydrate: false` while others set `hydrate: true`.
The page will not hydrate. Align route `hydrate` settings to silence this warning.
```

**How to resolve conflicts:**

- **Option 1:** Remove explicit `hydrate: true` from child routes (let them use default behavior or inherit from parent)
- **Option 2:** Remove `hydrate: false` from parent routes if child routes need hydration
- **Option 3:** Restructure your routes so interactive and static pages are in separate branches

## Use Cases

### 📄 When to use `hydrate: false`:

**Important:** This is a very rare use case. Most applications should keep the default hydration behavior.

Use `hydrate: false` only when:

- You want a **truly static page** with zero React on the client
- You're willing to give up **all client-side navigation** and interactivity
- You want to avoid the overhead of loading React entirely
- Examples: Print-only views, embedded content, purely informational pages

### ⚡ When to explicitly use `hydrate: true`:

You typically don't need to explicitly set `hydrate: true` since it's the default behavior. However, explicitly setting it is useful when:

- **Documenting intent**: Making it clear that a route requires hydration
- **Overriding `defaultHydrate: false`**: When you've set a global default of `false` but need specific routes to hydrate
- **Attempting to override a parent**: Though this creates a conflict (see Conflict Detection above), you might use `hydrate: true` to signal that a child route needs hydration even if a parent has `hydrate: false`

For general interactive features (forms, dashboards, real-time updates, user interactions), simply omit the `hydrate` option and use the default behavior.

## Performance Impact

When `hydrate: false` is in effect for the **initial page load**, the page ships only the SSR HTML plus any inline `head().scripts` and external `head().scripts` — no JavaScript framework runtime, no router client bundle, and no application code.

**Load Time Improvements:**

- No JavaScript parsing/execution
- No hydration time
- Instant interactivity (no loading state)

## Example: Mixed Application

A typical application might use both options:

```tsx
// Root route - enable hydration by default
export const Route = createRootRoute({
  component: RootComponent,
})

// Marketing pages - no hydration needed
export const Route = createFileRoute('/about')({
  hydrate: false,
  component: AboutPage,
})

export const Route = createFileRoute('/blog/$slug')({
  hydrate: false,
  loader: fetchBlogPost,
  component: BlogPost,
})

// Legal pages - no hydration needed
export const Route = createFileRoute('/legal/privacy')({
  hydrate: false,
  component: PrivacyPolicy,
})

// App pages - need hydration for interactivity
export const Route = createFileRoute('/dashboard')({
  hydrate: true, // explicit for clarity
  loader: fetchDashboardData,
  component: Dashboard,
})

export const Route = createFileRoute('/settings')({
  hydrate: true,
  component: SettingsPage,
})
```

## Development Mode

In development mode, Hot Module Replacement (HMR) is kept even when `hydrate: false` is set. This allows you to:

- ✅ See changes instantly during development
- ✅ Test the no-JavaScript experience in production builds

To test the true `hydrate: false` experience:

```bash
# Build for production
pnpm build

# Preview the production build
pnpm preview
```

## Troubleshooting

### My page has `hydrate: false` but JavaScript is still loading

**Check:**

1. Are any parent routes setting `hydrate: true`?
2. Are you in development mode? (HMR is kept enabled)
3. Did you navigate in from another route? (`hydrate: false` only applies on initial load — see [Client-side navigation **into** a `hydrate: false` route](#client-side-navigation-into-a-hydrate-false-route))
4. Did you rebuild after changing the option?

```bash
pnpm build
```

### My interactive features stopped working

If you set `hydrate: false`, all React features will stop working on initial load:

- Event handlers (`onClick`, `onChange`)
- Reactive state and effects
- Context providers
- Client-side routing

**Solution:** Explicitly set `hydrate: true` or remove the option (which defaults to hydrating). For limited interactivity without React, see [Adding interactivity with plain JavaScript](#adding-interactivity-with-plain-javascript).

### I'm seeing hydration errors

Hydration errors occur when server-rendered HTML doesn't match the client. If you have these errors:

1. Consider `ssr: 'data-only'` (skip server rendering, only load data)
2. Or use `hydrate: false` if the page doesn't need interactivity

See the [Hydration Errors guide](./hydration-errors) for more details.

## Summary

The `hydrate` option gives you precise **page-level** control over client-side React hydration:

- **Default (omitted)**: Pages hydrate by default - Full SSR + Hydration = Interactive pages
- **`hydrate: true`**: Explicitly ensures a page is hydrated (useful for conflict resolution or documenting intent)
- **`hydrate: false`**: Static server-rendered pages with no JavaScript (on initial load only — see [Client-side navigation](#client-side-navigation-into-a-hydrate-false-route))
- **Opt-in/opt-out mechanism**: Conflicts occur only when explicit `true` and `false` values are both present
- **Inheritance**: If any route has `hydrate: false`, the page won't hydrate

**Note:** This is **page-level** hydration control. For **component-level** opt-in/opt-out hydration (Server Components), stay tuned for upcoming releases from TanStack Router.

Use `hydrate: false` for truly static pages to:

- ⚡ Reduce bundle size
- 🚀 Improve load times
- 📉 Minimize JavaScript overhead
- 🔍 Maintain perfect SEO

For interactive pages, simply omit the `hydrate` option to use the default behavior:

- 🎯 User interactions
- 💾 Client-side state
- 🔄 Real-time updates
- ⚡ Dynamic behavior
