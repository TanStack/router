---
title: Path Params
---

Path params are used to match a single segment (the text until the next `/`) and provide its value back to you as a **named** variable. They are defined by using the `$` character prefix in the path, followed by the key variable to assign it to. The following are valid path param paths:

- `$postId`
- `$name`
- `$teamId`
- `about/$name`
- `team/$teamId`
- `blog/$postId`

Because path param routes only match to the next `/`, child routes can be created to continue expressing hierarchy:

Let's create a post route file that uses a path param to match the post ID:

- `posts.$postId.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
})
```

## Path Params can be used by child routes

Once a path param has been parsed, it is available to all child routes. This means that if we define a child route to our `postRoute`, we can use the `postId` variable from the URL in the child route's path!

## Path Params in Loaders

Path params are passed to the loader as a `params` object. The keys of this object are the names of the path params, and the values are the values that were parsed out of the actual URL path. For example, if we were to visit the `/blog/123` URL, the `params` object would be `{ postId: '123' }`:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => {
    return fetchPost(params.postId)
  },
})
```

The `params` object is also passed to the `beforeLoad` option:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  beforeLoad: async ({ params }) => {
    // do something with params.postId
  },
})
```

## Path Params in Components

If we add a component to our `postRoute`, we can access the `postId` variable from the URL by using the route's `useParams` hook:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  return <div>Post {postId}</div>
}
```

> 🧠 Quick tip: If your component is code-split, you can use the [getRouteApi function](./code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useParams()` hook.

## Path Params outside of Routes

You can also use the globally exported `useParams` hook to access any parsed path params from any component in your app. You'll need to pass the `strict: false` option to `useParams`, denoting that you want to access the params from an ambiguous location:

```tsx
function PostComponent() {
  const { postId } = useParams({ strict: false })
  return <div>Post {postId}</div>
}
```

## Navigating with Path Params

When navigating to a route with path params, TypeScript will require you to pass the params either as an object or as a function that returns an object of params.

Let's see what an object style looks like:

```tsx
function Component() {
  return (
    <Link to="/blog/$postId" params={{ postId: '123' }}>
      Post 123
    </Link>
  )
}
```

And here's what a function style looks like:

```tsx
function Component() {
  return (
    <Link to="/blog/$postId" params={(prev) => ({ ...prev, postId: '123' })}>
      Post 123
    </Link>
  )
}
```

Notice that the function style is useful when you need to persist params that are already in the URL for other routes. This is because the function style will receive the current params as an argument, allowing you to modify them as needed and return the final params object.

## Prefixes and Suffixes for Path Params

You can also use **prefixes** and **suffixes** with path params to create more complex routing patterns. This allows you to match specific URL structures while still capturing the dynamic segments.

When using either prefixes or suffixes, you can define them by wrapping the path param in curly braces `{}` and placing the prefix or suffix before or after the variable name.

### Defining Prefixes

Prefixes are defined by placing the prefix text outside the curly braces before the variable name. For example, if you want to match a URL that starts with `post-` followed by a post ID, you can define it like this:

```tsx
// src/routes/posts/post-{$postId}.tsx
export const Route = createFileRoute('/posts/post-{$postId}')({
  component: PostComponent,
})

function PostComponent() {
  const { postId } = Route.useParams()
  // postId will be the value after 'post-'
  return <div>Post ID: {postId}</div>
}
```

You can even combines prefixes with wildcard routes to create more complex patterns:

```tsx
// src/routes/on-disk/storage-{$}
export const Route = createFileRoute('/on-disk/storage-{$postId}/$')({
  component: StorageComponent,
})

function StorageComponent() {
  const { _splat } = Route.useParams()
  // _splat, will be value after 'storage-'
  // i.e. my-drive/documents/foo.txt
  return <div>Storage Location: /{_splat}</div>
}
```

### Defining Suffixes

Suffixes are defined by placing the suffix text outside the curly braces after the variable name. For example, if you want to match a URL a filename that ends with `txt`, you can define it like this:

```tsx
// src/routes/files/{$fileName}txt
export const Route = createFileRoute('/files/{$fileName}.txt')({
  component: FileComponent,
})

function FileComponent() {
  const { fileName } = Route.useParams()
  // fileName will be the value before 'txt'
  return <div>File Name: {fileName}</div>
}
```

You can also combine suffixes with wildcards for more complex routing patterns:

```tsx
// src/routes/files/{$}[.]txt
export const Route = createFileRoute('/files/{$fileName}[.]txt')({
  component: FileComponent,
})

function FileComponent() {
  const { _splat } = Route.useParams()
  // _splat will be the value before '.txt'
  return <div>File Splat: {_splat}</div>
}
```

### Combining Prefixes and Suffixes

You can combine both prefixes and suffixes to create very specific routing patterns. For example, if you want to match a URL that starts with `user-` and ends with `.json`, you can define it like this:

```tsx
// src/routes/users/user-{$userId}.json
export const Route = createFileRoute('/users/user-{$userId}.json')({
  component: UserComponent,
})

function UserComponent() {
  const { userId } = Route.useParams()
  // userId will be the value between 'user-' and '.json'
  return <div>User ID: {userId}</div>
}
```

Similar to the previous examples, you can also use wildcards with prefixes and suffixes. Go wild!

## Optional Path Parameters

Optional path parameters allow you to define route segments that may or may not be present in the URL. They use the `{-$paramName}` syntax and provide flexible routing patterns where certain parameters are optional.

### Defining Optional Parameters

Optional path parameters are defined using curly braces with a dash prefix: `{-$paramName}`

```tsx
// Single optional parameter
// src/routes/posts/{-$category}.tsx
export const Route = createFileRoute('/posts/{-$category}')({
  component: PostsComponent,
})

// Multiple optional parameters
// src/routes/posts/{-$category}/{-$slug}.tsx
export const Route = createFileRoute('/posts/{-$category}/{-$slug}')({
  component: PostComponent,
})

// Mixed required and optional parameters
// src/routes/users/$id/{-$tab}.tsx
export const Route = createFileRoute('/users/$id/{-$tab}')({
  component: UserComponent,
})
```

### How Optional Parameters Work

Optional parameters create flexible URL patterns:

- `/posts/{-$category}` matches both `/posts` and `/posts/tech`
- `/posts/{-$category}/{-$slug}` matches `/posts`, `/posts/tech`, and `/posts/tech/hello-world`
- `/users/$id/{-$tab}` matches `/users/123` and `/users/123/settings`

When an optional parameter is not present in the URL, its value will be `undefined` in your route handlers and components.

### Accessing Optional Parameters

Optional parameters work exactly like regular parameters in your components, but their values may be `undefined`:

```tsx
function PostsComponent() {
  const { category } = Route.useParams()

  return <div>{category ? `Posts in ${category}` : 'All Posts'}</div>
}
```

### Optional Parameters in Loaders

Optional parameters are available in loaders and may be `undefined`:

```tsx
export const Route = createFileRoute('/posts/{-$category}')({
  loader: async ({ params }) => {
    // params.category might be undefined
    return fetchPosts({ category: params.category })
  },
})
```

### Optional Parameters in beforeLoad

Optional parameters work in `beforeLoad` handlers as well:

```tsx
export const Route = createFileRoute('/posts/{-$category}')({
  beforeLoad: async ({ params }) => {
    if (params.category) {
      // Validate category exists
      await validateCategory(params.category)
    }
  },
})
```

### Advanced Optional Parameter Patterns

#### With Prefix and Suffix

Optional parameters support prefix and suffix patterns:

```tsx
// File route: /files/prefix{-$name}.txt
// Matches: /files/prefix.txt and /files/prefixdocument.txt
export const Route = createFileRoute('/files/prefix{-$name}.txt')({
  component: FileComponent,
})

function FileComponent() {
  const { name } = Route.useParams()
  return <div>File: {name || 'default'}</div>
}
```

#### All Optional Parameters

You can create routes where all parameters are optional:

```tsx
// Route: /{-$year}/{-$month}/{-$day}
// Matches: /, /2023, /2023/12, /2023/12/25
export const Route = createFileRoute('/{-$year}/{-$month}/{-$day}')({
  component: DateComponent,
})

function DateComponent() {
  const { year, month, day } = Route.useParams()

  if (!year) return <div>Select a year</div>
  if (!month) return <div>Year: {year}</div>
  if (!day)
    return (
      <div>
        Month: {year}/{month}
      </div>
    )

  return (
    <div>
      Date: {year}/{month}/{day}
    </div>
  )
}
```

#### Optional Parameters with Wildcards

Optional parameters can be combined with wildcards for complex routing patterns:

```tsx
// Route: /docs/{-$version}/$
// Matches: /docs/extra/path, /docs/v2/extra/path
export const Route = createFileRoute('/docs/{-$version}/$')({
  component: DocsComponent,
})

function DocsComponent() {
  const { version } = Route.useParams()
  const { _splat } = Route.useParams()

  return (
    <div>
      Version: {version || 'latest'}
      Path: {_splat}
    </div>
  )
}
```

### Navigating with Optional Parameters

When navigating to routes with optional parameters, you have fine-grained control over which parameters to include:

```tsx
function Navigation() {
  return (
    <div>
      {/* Navigate with optional parameter */}
      <Link to="/posts/{-$category}" params={{ category: 'tech' }}>
        Tech Posts
      </Link>

      {/* Navigate without optional parameter */}
      <Link to="/posts/{-$category}" params={{ category: undefined }}>
        All Posts
      </Link>

      {/* Navigate with multiple optional parameters */}
      <Link
        to="/posts/{-$category}/{-$slug}"
        params={{ category: 'tech', slug: 'react-tips' }}
      >
        Specific Post
      </Link>
    </div>
  )
}
```

### Type Safety with Optional Parameters

TypeScript provides full type safety for optional parameters:

```tsx
function PostsComponent() {
  // TypeScript knows category might be undefined
  const { category } = Route.useParams() // category: string | undefined

  // Safe navigation
  const categoryUpper = category?.toUpperCase()

  return <div>{categoryUpper || 'All Categories'}</div>
}

// Navigation is type-safe and flexible
<Link
  to="/posts/{-$category}"
  params={{ category: 'tech' }} // ✅ Valid - string
>
  Tech Posts
</Link>

<Link
  to="/posts/{-$category}"
  params={{ category: 123 }} // ✅ Valid - number (auto-stringified)
>
  Category 123
</Link>
```

## Internationalization (i18n) with Optional Path Parameters

Optional path parameters are excellent for implementing internationalization (i18n) routing patterns. You can use prefix patterns to handle multiple languages while maintaining clean, SEO-friendly URLs.

### Prefix-based i18n

Use optional language prefixes to support URLs like `/en/about`, `/fr/about`, or just `/about` (default language):

```tsx
// Route: /{-$locale}/about
export const Route = createFileRoute('/{-$locale}/about')({
  component: AboutComponent,
})

function AboutComponent() {
  const { locale } = Route.useParams()
  const currentLocale = locale || 'en' // Default to English

  const content = {
    en: { title: 'About Us', description: 'Learn more about our company.' },
    fr: {
      title: 'À Propos',
      description: 'En savoir plus sur notre entreprise.',
    },
    es: {
      title: 'Acerca de',
      description: 'Conoce más sobre nuestra empresa.',
    },
  }

  return (
    <div>
      <h1>{content[currentLocale]?.title}</h1>
      <p>{content[currentLocale]?.description}</p>
    </div>
  )
}
```

This pattern matches:

- `/about` (default locale)
- `/en/about` (explicit English)
- `/fr/about` (French)
- `/es/about` (Spanish)

### Complex i18n Patterns

Combine optional parameters for more sophisticated i18n routing:

```tsx
// Route: /{-$locale}/blog/{-$category}/$slug
export const Route = createFileRoute('/{-$locale}/blog/{-$category}/$slug')({
  beforeLoad: async ({ params }) => {
    const locale = params.locale || 'en'
    const category = params.category

    // Validate locale and category
    const validLocales = ['en', 'fr', 'es', 'de']
    if (locale && !validLocales.includes(locale)) {
      throw new Error('Invalid locale')
    }

    return { locale, category }
  },
  loader: async ({ params, context }) => {
    const { locale } = context
    const { slug, category } = params

    return fetchBlogPost({ slug, category, locale })
  },
  component: BlogPostComponent,
})

function BlogPostComponent() {
  const { locale, category, slug } = Route.useParams()
  const data = Route.useLoaderData()

  return (
    <article>
      <h1>{data.title}</h1>
      <p>
        Category: {category || 'All'} | Language: {locale || 'en'}
      </p>
      <div>{data.content}</div>
    </article>
  )
}
```

This supports URLs like:

- `/blog/tech/my-post` (default locale, tech category)
- `/fr/blog/my-post` (French, no category)
- `/en/blog/tech/my-post` (explicit English, tech category)
- `/es/blog/tecnologia/mi-post` (Spanish, Spanish category)

### Language Navigation

Create language switchers using optional i18n parameters with function-style params:

```tsx
function LanguageSwitcher() {
  const currentParams = useParams({ strict: false })

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
    { code: 'es', name: 'Español' },
  ]

  return (
    <div className="language-switcher">
      {languages.map(({ code, name }) => (
        <Link
          key={code}
          to="/{-$locale}/blog/{-$category}/$slug"
          params={(prev) => ({
            ...prev,
            locale: code === 'en' ? undefined : code, // Remove 'en' for clean URLs
          })}
          className={currentParams.locale === code ? 'active' : ''}
        >
          {name}
        </Link>
      ))}
    </div>
  )
}
```

You can also create more sophisticated language switching logic:

```tsx
function AdvancedLanguageSwitcher() {
  const currentParams = useParams({ strict: false })

  const handleLanguageChange = (newLocale: string) => {
    return (prev: any) => {
      // Preserve all existing params but update locale
      const updatedParams = { ...prev }

      if (newLocale === 'en') {
        // Remove locale for clean English URLs
        delete updatedParams.locale
      } else {
        updatedParams.locale = newLocale
      }

      return updatedParams
    }
  }

  return (
    <div className="language-switcher">
      <Link
        to="/{-$locale}/blog/{-$category}/$slug"
        params={handleLanguageChange('fr')}
      >
        Français
      </Link>

      <Link
        to="/{-$locale}/blog/{-$category}/$slug"
        params={handleLanguageChange('es')}
      >
        Español
      </Link>

      <Link
        to="/{-$locale}/blog/{-$category}/$slug"
        params={handleLanguageChange('en')}
      >
        English
      </Link>
    </div>
  )
}
```

### Advanced i18n with Optional Parameters

Organize i18n routes using optional parameters for flexible locale handling:

```tsx
// Route structure:
// routes/
//   {-$locale}/
//     index.tsx        // /, /en, /fr
//     about.tsx        // /about, /en/about, /fr/about
//     blog/
//       index.tsx      // /blog, /en/blog, /fr/blog
//       $slug.tsx      // /blog/post, /en/blog/post, /fr/blog/post

// routes/{-$locale}/index.tsx
export const Route = createFileRoute('/{-$locale}/')({
  component: HomeComponent,
})

function HomeComponent() {
  const { locale } = Route.useParams()
  const isRTL = ['ar', 'he', 'fa'].includes(locale || '')

  return (
    <div dir={isRTL ? 'rtl' : 'ltr'}>
      <h1>Welcome ({locale || 'en'})</h1>
      {/* Localized content */}
    </div>
  )
}

// routes/{-$locale}/about.tsx
export const Route = createFileRoute('/{-$locale}/about')({
  component: AboutComponent,
})
```

### SEO and Canonical URLs

Handle SEO for i18n routes properly:

```tsx
export const Route = createFileRoute('/{-$locale}/products/$id')({
  component: ProductComponent,
  head: ({ params, loaderData }) => {
    const locale = params.locale || 'en'
    const product = loaderData

    return {
      title: product.title[locale] || product.title.en,
      meta: [
        {
          name: 'description',
          content: product.description[locale] || product.description.en,
        },
        {
          property: 'og:locale',
          content: locale,
        },
      ],
      links: [
        // Canonical URL (always use default locale format)
        {
          rel: 'canonical',
          href: `https://example.com/products/${params.id}`,
        },
        // Alternate language versions
        {
          rel: 'alternate',
          hreflang: 'en',
          href: `https://example.com/products/${params.id}`,
        },
        {
          rel: 'alternate',
          hreflang: 'fr',
          href: `https://example.com/fr/products/${params.id}`,
        },
        {
          rel: 'alternate',
          hreflang: 'es',
          href: `https://example.com/es/products/${params.id}`,
        },
      ],
    }
  },
})
```

### Type Safety for i18n

Ensure type safety for your i18n implementations:

```tsx
// Define supported locales
type Locale = 'en' | 'fr' | 'es' | 'de'

// Type-safe locale validation
function validateLocale(locale: string | undefined): locale is Locale {
  return ['en', 'fr', 'es', 'de'].includes(locale as Locale)
}

export const Route = createFileRoute('/{-$locale}/shop/{-$category}')({
  beforeLoad: async ({ params }) => {
    const { locale } = params

    // Type-safe locale validation
    if (locale && !validateLocale(locale)) {
      throw redirect({
        to: '/shop/{-$category}',
        params: { category: params.category },
      })
    }

    return {
      locale: (locale as Locale) || 'en',
      isDefaultLocale: !locale || locale === 'en',
    }
  },
  component: ShopComponent,
})

function ShopComponent() {
  const { locale, category } = Route.useParams()
  const { isDefaultLocale } = Route.useRouteContext()

  // TypeScript knows locale is Locale | undefined
  // and we have validated it in beforeLoad

  return (
    <div>
      <h1>Shop {category ? `- ${category}` : ''}</h1>
      <p>Language: {locale || 'en'}</p>
      {!isDefaultLocale && (
        <Link to="/shop/{-$category}" params={{ category }}>
          View in English
        </Link>
      )}
    </div>
  )
}
```

Optional path parameters provide a powerful and flexible foundation for implementing internationalization in your TanStack Router applications. Whether you prefer prefix-based or combined approaches, you can create clean, SEO-friendly URLs while maintaining excellent developer experience and type safety.

## Validating Path Parameters During Matching

> [!WARNING]
> The `skipRouteOnParseError` option is currently **experimental** and may change in future releases.

> [!IMPORTANT]
> **Performance cost**: This feature has a **non-negligible performance cost** and should not be used indiscriminately. It creates additional branches in the route matching tree, reducing matching efficiency and requiring more route evaluations. Use it only when you genuinely need type-specific routes at the same path level.

By default, TanStack Router matches routes based purely on URL structure. A route with `/$param` will match any value for that parameter, and validation via `params.parse` happens later in the route lifecycle. If validation fails, the route shows an error state.

However, sometimes you want routes to match only when parameters meet specific criteria, with the router automatically falling back to alternative routes when validation fails. This is where `skipRouteOnParseError` comes in.

### When to Use This Feature

Use `skipRouteOnParseError.params` when you need:

- **Type-specific routes**: Different routes for UUIDs vs. slugs at the same path (e.g., `/$uuid` and `/$slug`)
- **Format-specific routes**: Date-formatted paths vs. regular slugs (e.g., `/posts/2024-01-15` vs. `/posts/my-post`)
- **Numeric vs. string routes**: Different behavior for numeric IDs vs. usernames (e.g., `/users/123` vs. `/users/johndoe`)
- **Pattern-based routing**: Complex validation patterns where you want automatic fallback to other routes

Before using `skipRouteOnParseError.params`, consider whether you can achieve your goals with standard route matching:

- Using a static route prefix (e.g., `/id/$id` vs. `/username/$username`)
- Using a prefix or suffix in the path (e.g., `/user-{$id}` vs. `/$username`)

### How It Works

The `skipRouteOnParseError` option changes when `params.parse` runs, but not what it does:

**Without `skipRouteOnParseError`**:

- Route matches based on URL structure alone
- `params.parse` runs during route lifecycle (after match)
- Errors from `params.parse` cause error state, showing `errorComponent`

**With `skipRouteOnParseError.params`**:

- Route matching includes running `params.parse`
- Errors from `params.parse` cause route to be skipped, continuing to find other matches
- If no route matches, shows `notFoundComponent`

Both modes still use `params.parse` for validation and transformation—the difference is timing and error handling.

### Basic Example: Numeric IDs with String Fallback

```tsx
// routes/$id.tsx - Only matches numeric IDs
export const Route = createFileRoute('/$id')({
  params: {
    parse: (params) => {
      const id = parseInt(params.id, 10)
      if (isNaN(id)) throw new Error('ID must be numeric')
      return { id }
    },
  },
  skipRouteOnParseError: { params: true },
  component: UserByIdComponent,
})

function UserByIdComponent() {
  const { id } = Route.useParams() // id is number (from parsed params)
  const loaderData = Route.useLoaderData()
  return <div>User ID: {id}</div>
}

// routes/$username.tsx - Matches any string
export const UsernameRoute = createFileRoute('/$username')({
  // No params.parse - accepts any string
  component: UserByUsernameComponent,
})

function UserByUsernameComponent() {
  const { username } = Route.useParams() // username is string
  return <div>Username: {username}</div>
}
```

With this setup:

- `/123` → Matches `/$id` route (validation passes)
- `/johndoe` → Skips `/$id` (validation fails), matches `/$username` route

### Pattern-Based Validation Examples

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

### Understanding Route Priority

When multiple routes could match the same URL, TanStack Router uses this priority order:

1. **Static routes** (highest priority) - e.g., `/settings`
2. **Dynamic routes** - e.g., `/$slug`
3. **Optional routes** - e.g., `/{-$lang}`
4. **Wildcard routes** (lowest priority) - e.g., `/$`

When `skipRouteOnParseError` is used, validated routes are treated as having higher priority than non-validated routes _of the same category_. For example, a validated optional route has higher priority than a non-validated optional route, but lower priority than any dynamic route.

Example demonstrating priority:

```tsx
// Static route - always matches /settings first
export const SettingsRoute = createFileRoute('/settings')({
  component: SettingsComponent,
})

// Validated route - matches numeric IDs
export const IdRoute = createFileRoute('/$id')({
  params: {
    parse: (params) => ({ id: parseInt(params.id, 10) }),
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

- `/settings` → Static route (highest priority, even though ID route would validate)
- `/123` → Validated dynamic route (`/$id` validation passes)
- `/hello` → Non-validated dynamic route (`/$id` validation fails)

### Custom Priority Between Validated Routes

When you have multiple validated routes at the same level, and because `params.parse` can be any arbitrary code, you may have situations where multiple routes could potentially validate successfully. In these cases you can provide a custom priority as a tie-breaker using `skipRouteOnParseError.priority`.

Higher numbers mean higher priority, and no priority defaults to 0.

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

`skipRouteOnParseError` works with optional parameters:

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

## Allowed Characters

By default, path params are escaped with `encodeURIComponent`. If you want to allow other valid URI characters (e.g. `@` or `+`), you can specify that in your [RouterOptions](../api/router/RouterOptionsType.md#pathparamsallowedcharacters-property).

Example usage:

```tsx
const router = createRouter({
  // ...
  pathParamsAllowedCharacters: ['@'],
})
```

The following is the list of accepted allowed characters:

- `;`
- `:`
- `@`
- `&`
- `=`
- `+`
- `$`
- `,`
