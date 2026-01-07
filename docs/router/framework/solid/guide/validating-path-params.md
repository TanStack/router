---
title: Validating Path Params
---

Path parameters are captured from URLs as strings. Often, you need to transform or validate these strings before using them in your application - converting them to numbers, parsing dates, validating UUIDs, or ensuring they meet specific criteria.

TanStack Router provides `params.parse` and `params.stringify` options for transforming and validating path parameters, with flexible error handling strategies to suit different use cases.

## Parsing Path Parameters

The `params.parse` function transforms and validates path parameters as they're extracted from the URL. This is useful for:

- **Type conversion**: Converting string parameters to numbers, dates, or other types
- **Validation**: Ensuring parameters meet specific criteria (e.g., UUIDs, email formats)
- **Normalization**: Cleaning or standardizing parameter values

### Basic Example

```tsx
import { createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/users/$id')({
  params: {
    parse: (params) => ({
      id: parseInt(params.id, 10),
    }),
  },
  loader: async ({ params }) => {
    // params.id is now a number
    return fetchUser(params.id)
  },
  component: UserComponent,
})

function UserComponent() {
  const { id } = Route.useParams()
  // TypeScript knows id is a number
  return <div>User ID: {id}</div>
}
```

### Validation with Error Handling

When `params.parse` throws an error, the route's `errorComponent` is displayed by default:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  params: {
    parse: (params) => {
      const postId = parseInt(params.postId, 10)
      if (isNaN(postId) || postId <= 0) {
        throw new Error('Post ID must be a positive number')
      }
      return { postId }
    },
  },
  errorComponent: ({ error }) => {
    return <div>Invalid post ID: {error.message}</div>
  },
  component: PostComponent,
})
```

With this setup:

- `/posts/123` → Renders `PostComponent` with `params.postId = 123`
- `/posts/abc` → Renders `errorComponent` with the validation error

### Complex Validation Examples

#### UUID Validation

```tsx
export const Route = createFileRoute('/resources/$uuid')({
  params: {
    parse: (params) => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

      if (!uuidRegex.test(params.uuid)) {
        throw new Error('Invalid UUID format')
      }

      return { uuid: params.uuid }
    },
  },
  loader: async ({ params }) => fetchByUuid(params.uuid),
})
```

#### Date Parsing

```tsx
export const Route = createFileRoute('/events/$date')({
  params: {
    parse: (params) => {
      const date = new Date(params.date)

      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format. Use YYYY-MM-DD')
      }

      return { date }
    },
  },
  loader: async ({ params }) => {
    // params.date is a Date object
    return fetchEventsByDate(params.date)
  },
})
```

#### Using Validation Libraries

You can integrate validation libraries like Zod, Valibot, or ArkType:

```tsx
import { z } from 'zod'

const paramsSchema = z.object({
  userId: z.coerce.number().positive(),
})

export const Route = createFileRoute('/users/$userId')({
  params: {
    parse: (params) => paramsSchema.parse(params),
  },
})
```

## Stringifying Path Parameters

The `params.stringify` function is the inverse of `params.parse` - it transforms your typed parameters back into URL-safe strings for navigation.

### Basic Example

```tsx
export const Route = createFileRoute('/users/$id')({
  params: {
    parse: (params) => ({
      id: parseInt(params.id, 10),
    }),
    stringify: (params) => ({
      id: String(params.id),
    }),
  },
})

// When navigating
function Component() {
  return (
    <A href="/users/$id" params={{ id: 123 }}>
      {/* Router calls stringify to convert 123 to "123" */}
      Go to User
    </A>
  )
}
```

### Date Stringification

```tsx
export const Route = createFileRoute('/events/$date')({
  params: {
    parse: (params) => ({
      date: new Date(params.date),
    }),
    stringify: (params) => ({
      date: params.date.toISOString().split('T')[0], // YYYY-MM-DD
    }),
  },
})

function Component() {
  return (
    <A href="/events/$date" params={{ date: new Date('2024-01-15') }}>
      {/* Converts to /events/2024-01-15 */}
      View Event
    </A>
  )
}
```

## Error Handling Strategies

When parameter validation fails, TanStack Router offers two error handling strategies:

### Default Behavior: Show Error Component

By default, when `params.parse` throws:

1. The route matches based on URL structure
2. `params.parse` runs during the route lifecycle
3. If parsing fails, the route enters an error state
4. The route's `errorComponent` is displayed

This is useful when:

- You have a single route handling all variations of a parameter
- You want to show error UI for invalid parameters
- The route structure is clear and you don't need fallbacks

### Alternative: Skip Route on Parse Error (⚠️ Experimental)

Sometimes you want the router to try alternative routes when validation fails. For example, you might have:

- Different routes for numeric IDs vs. string slugs at the same URL path
- Routes that match only specific parameter formats (UUIDs, dates, etc.)

This is where `skipRouteOnParseError` comes in.

> [!WARNING]
> The `skipRouteOnParseError` option is currently **experimental** and may change in future releases.
>
> **Performance cost**: This feature has a **non-negligible performance cost** and should only be enabled when needed. It creates additional branches in the route matching tree, reducing matching efficiency and requiring more route evaluations. Use it only when you genuinely need type-specific routes at the same path level.

## Validating During Route Matching

With `skipRouteOnParseError.params` enabled, parameter validation becomes part of the route matching process:

1. Route structure matches the URL path
2. `params.parse` runs immediately during matching
3. If parsing fails, the route is skipped
4. The router continues searching for other matching routes
5. If no routes match, `notFoundComponent` is shown

### When to Use This Feature

Use `skipRouteOnParseError.params` when you need:

- **Type-specific routes**: Different routes for UUIDs vs. slugs at the same path (e.g., `/$uuid` and `/$slug`)
- **Format-specific routes**: Date-formatted paths vs. regular slugs (e.g., `/posts/2024-01-15` vs. `/posts/my-post`)
- **Numeric vs. string routes**: Different behavior for numeric IDs vs. usernames (e.g., `/users/123` vs. `/users/johndoe`)

Before using `skipRouteOnParseError.params`, consider whether you can achieve your goals with standard route matching:

- Using a static route prefix (e.g., `/id/$id` vs. `/username/$username`)
- Using a prefix or suffix in the path (e.g., `/user-{$id}` vs. `/$username`)

### Basic Example: Numeric IDs with String Fallback

```tsx
// routes/$id.tsx - Only matches numeric IDs
export const Route = createFileRoute('/$id')({
  params: {
    parse: (params) => {
      const id = parseInt(params.id, 10)
      if (isNaN(id)) {
        throw new Error('ID must be numeric')
      }
      return { id }
    },
  },
  skipRouteOnParseError: { params: true },
  loader: async ({ params }) => fetchUserById(params.id),
  component: UserByIdComponent,
})

// routes/$username.tsx - Matches any string
export const UsernameRoute = createFileRoute('/$username')({
  // No params.parse - accepts any string
  loader: async ({ params }) => fetchUserByUsername(params.username),
  component: UserByUsernameComponent,
})
```

Results:

- `/123` → Matches `/$id` route (validation passes), `params.id` is a number
- `/johndoe` → Skips `/$id` (validation fails), matches `/$username` route

### Pattern-Based Validation

#### UUID vs. Slug Routes

```tsx
// routes/$uuid.tsx - Only matches valid UUIDs
export const Route = createFileRoute('/$uuid')({
  params: {
    parse: (params) => {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (!uuidRegex.test(params.uuid)) {
        throw new Error('Not a valid UUID')
      }
      return { uuid: params.uuid }
    },
  },
  skipRouteOnParseError: { params: true },
  loader: async ({ params }) => fetchByUuid(params.uuid),
  component: UuidResourceComponent,
})

// routes/$slug.tsx - Matches any string
export const SlugRoute = createFileRoute('/$slug')({
  loader: async ({ params }) => fetchBySlug(params.slug),
  component: SlugResourceComponent,
})
```

Results:

- `/550e8400-e29b-41d4-a716-446655440000` → Matches UUID route
- `/my-blog-post` → Matches slug route

#### Date-Formatted Posts

```tsx
// routes/posts/$date.tsx - Only matches YYYY-MM-DD format
export const Route = createFileRoute('/posts/$date')({
  params: {
    parse: (params) => {
      const date = new Date(params.date)
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date format')
      }
      return { date }
    },
  },
  skipRouteOnParseError: { params: true },
  loader: async ({ params }) => fetchPostsByDate(params.date),
  component: DatePostsComponent,
})

// routes/posts/$slug.tsx - Matches any string
export const PostSlugRoute = createFileRoute('/posts/$slug')({
  loader: async ({ params }) => fetchPostBySlug(params.slug),
  component: PostComponent,
})
```

Results:

- `/posts/2024-01-15` → Matches date route, `params.date` is a Date object
- `/posts/my-first-post` → Matches slug route

### Route Priority

When multiple routes could match the same URL, TanStack Router uses this priority order:

1. **Static routes** (highest priority) - e.g., `/settings`
2. **Dynamic routes** - e.g., `/$slug`
3. **Optional routes** - e.g., `/{-$lang}`
4. **Wildcard routes** (lowest priority) - e.g., `/$`

When `skipRouteOnParseError` is used, validated routes are treated as having higher priority than non-validated routes _of the same category_.

Example demonstrating priority:

```tsx
// Static route - always matches /settings first
export const SettingsRoute = createFileRoute('/settings')({
  component: SettingsComponent,
})

// Validated route - matches numeric IDs
export const IdRoute = createFileRoute('/$id')({
  params: {
    parse: (params) => {
      const id = parseInt(params.id, 10)
      if (isNaN(id)) throw new Error('Not numeric')
      return { id }
    },
  },
  skipRouteOnParseError: { params: true },
  component: IdComponent,
})

// Non-validated route - fallback for any string
export const SlugRoute = createFileRoute('/$slug')({
  component: SlugComponent,
})
```

Matching results:

- `/settings` → Static route (highest priority)
- `/123` → Validated dynamic route (`/$id`)
- `/hello` → Non-validated dynamic route (`/$slug`)

### Custom Priority Between Validated Routes

When you have multiple validated routes at the same level, use `skipRouteOnParseError.priority` as a tie-breaker. Higher numbers mean higher priority (default is 0).

```tsx
// routes/$uuid.tsx
export const UuidRoute = createFileRoute('/$uuid')({
  params: {
    parse: (params) => {
      if (!isUuid(params.uuid)) throw new Error('Not a UUID')
      return params
    },
  },
  skipRouteOnParseError: {
    params: true,
    priority: 10, // Try this first
  },
  component: UuidComponent,
})

// routes/$number.tsx
export const NumberRoute = createFileRoute('/$number')({
  params: {
    parse: (params) => ({
      number: parseInt(params.number, 10),
    }),
  },
  skipRouteOnParseError: {
    params: true,
    priority: 5, // Try this second
  },
  component: NumberComponent,
})

// routes/$slug.tsx
export const SlugRoute = createFileRoute('/$slug')({
  // No validation - lowest priority by default
  component: SlugComponent,
})
```

Matching order:

1. Check UUID validation (priority 10)
2. Check number validation (priority 5)
3. Fall back to slug route (no validation)

### Nested Routes with Validation

Parent route validation gates access to child routes:

```tsx
// routes/$orgId.tsx - Parent route, only matches numeric org IDs
export const OrgRoute = createFileRoute('/$orgId')({
  params: {
    parse: (params) => ({
      orgId: parseInt(params.orgId, 10),
    }),
  },
  skipRouteOnParseError: { params: true },
  component: OrgLayoutComponent,
})

// routes/$orgId/settings.tsx - Child route
export const OrgSettingsRoute = createFileRoute('/$orgId/settings')({
  component: OrgSettingsComponent,
})

// routes/$slug/settings.tsx - Alternative route
export const SlugSettingsRoute = createFileRoute('/$slug/settings')({
  component: SettingsComponent,
})
```

Results:

- `/123/settings` → Matches `/$orgId/settings` (parent validation passes)
- `/my-org/settings` → Matches `/$slug/settings` (`/$orgId` validation fails)

### Working with Optional Parameters

`skipRouteOnParseError` works with optional parameters too:

```tsx
// routes/{-$lang}/home.tsx - Validates language codes
export const Route = createFileRoute('/{-$lang}/home')({
  params: {
    parse: (params) => {
      const validLangs = ['en', 'fr', 'es', 'de']
      if (params.lang && !validLangs.includes(params.lang)) {
        throw new Error('Invalid language code')
      }
      return { lang: params.lang || 'en' }
    },
  },
  skipRouteOnParseError: { params: true },
  component: HomeComponent,
})
```

Results:

- `/home` → Matches (optional param skipped, defaults to 'en')
- `/en/home` → Matches (validation passes)
- `/fr/home` → Matches (validation passes)
- `/it/home` → No match (validation fails, 'it' not in valid list)

## Best Practices

### When to Use params.parse

Use `params.parse` for:

- Converting string parameters to appropriate types (numbers, dates, booleans)
- Validating parameter formats (UUIDs, emails, patterns)
- Normalizing parameter values
- Applying business logic constraints

### When to Add skipRouteOnParseError

Only use `skipRouteOnParseError.params` when you need:

- Multiple routes at the same URL path with different parameter requirements
- Automatic fallback to alternative routes when validation fails

Consider simpler alternatives first:

- Static prefixes or suffixes in route paths
- Separate URL paths for different parameter types
- Client-side validation without route-level enforcement

### Performance Considerations

Be aware that `skipRouteOnParseError`:

- Adds overhead to route matching
- Creates additional branches in the routing tree
- Can slow down navigation when you have many validated routes

Use it judiciously and only when the routing flexibility justifies the performance cost.

### Type Safety

TanStack Router infers types from your `params.parse` return value:

```tsx
export const Route = createFileRoute('/users/$id')({
  params: {
    parse: (params) => ({
      id: parseInt(params.id, 10), // Returns number
    }),
  },
  loader: ({ params }) => {
    // params.id is typed as number
    return fetchUser(params.id)
  },
})
```

The types automatically flow through to:

- `loader` functions
- `beforeLoad` functions
- `useParams()` hooks
- `<A>` components (when navigating)

This ensures type safety throughout your application.
