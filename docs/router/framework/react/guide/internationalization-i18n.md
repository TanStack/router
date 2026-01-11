---
title: Internationalization (i18n)
---

TanStack Router provides flexible and highly customizable primitives that can be composed to support common internationalization (i18n) routing patterns, such as **optional path parameters**, **route rewriting**, and **type-safe params**. This enables clean, SEO-friendly URLs, flexible locale handling, and seamless integration with i18n libraries.

This guide covers:

- Prefix-based and optional-locale routing
- Advanced routing patterns for i18n
- Language navigation and switching
- SEO considerations
- Type safety
- Integration patterns with i18n libraries (e.g. Paraglide)

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

## i18n Library Integration Patterns

TanStack Router is **library-agnostic**. You can integrate any i18n solution by mapping locale state to routing behavior.

Below is a recommended pattern using **Paraglide**.

### TanStack Router + Paraglide

Paraglide provides type-safe translations, locale detection, and URL localization that pair naturally with TanStack Router.

**GitHub example:**
[https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide](https://github.com/TanStack/router/tree/main/examples/react/i18n-paraglide)

#### Project Setup

```bash
npx @inlang/paraglide-js@latest init
```

```ts
import { paraglideVitePlugin } from '@inlang/paraglide-js'

paraglideVitePlugin({
  project: './project.inlang',
  outdir: './app/paraglide',
})
```

#### URL Localization via Router rewrite

```ts
import { deLocalizeUrl, localizeUrl } from './paraglide/runtime'

const router = createRouter({
  routeTree,
  rewrite: {
    input: ({ url }) => deLocalizeUrl(url),
    output: ({ url }) => localizeUrl(url),
  },
})
```

#### URL redirects

```ts
import { shouldRedirect } from '../paraglide/runtime'

beforeLoad: async () => {
  const decision = await shouldRedirect({ url: window.location.href })
  if (decision.redirectUrl) {
    throw redirect({ href: decision.redirectUrl.href })
  }
}
```

If you use TanStack Start and do not need offline capabilities, you don`t need to use the shouldRedirect logic, only paraglideMiddleware in the TanStack Start Paraglide integration guide.

#### Type-safe Translated Pathnames

If you use translated pathnames. To ensure every route has translations, you can derive translated pathnames directly from the TanStack Router route tree.

```ts
import { Locale } from "@reland/i18n/runtime"
import { RoutePath } from "../../types/Routes"

const excludedPaths = ["admin", "partner", "tests", "api"] as const

type PublicRoutePath = Exclude<
  RoutePath,
  `${string}${(typeof excludedPaths)[number]}${string}`
>

type TranslatedPathname = {
  pattern: string
  localized: Array<[Locale, string]>
}

function toUrlPattern(path: string) {
  return (
    path
      // explicit catch-all: "/$" → "/:path(.*)?"
      .replace(/\/\$$/, "/:path(.*)?")
      // optional params like {-$param} → ":param(.*)?"
      .replace(/\{-\$([a-zA-Z0-9_]+)\}/g, ":$1(.*)?")
      // normal params like $param → ":param(.*)?"
      .replace(/\$([a-zA-Z0-9_]+)/g, ":$1(.*)?")
      // remove any remaining braces (safety)
      .replace(/[{}]/g, "")
      // remove trailing slash
      .replace(/\/+$/, "")
  )
}

function createTranslatedPathnames(
  input: Record<PublicRoutePath, Record<Locale, string>>,
): TranslatedPathname[] {
  return Object.entries(input).map(([pattern, locales]) => ({
    pattern: toUrlPattern(pattern),
    localized: Object.entries(locales).map(
      ([locale, path]) =>
        [locale as Locale, `/${locale}${toUrlPattern(path)}`] satisfies [
          Locale,
          string,
        ],
    ),
  }))
}

export const translatedPathnames = createTranslatedPathnames({
  "/": {
    en: "/",
    de: "/"
  },
  "/about": {
    en: "/about",
    de: "/ueber"
  }
```

Use in vite.config.ts:

```ts
paraglideVitePlugin({
  project: './project.inlang',
  outdir: './app/paraglide',
  urlPatterns: translatedPathnames,
})
```

This guarantees:

- No missing translations
- Full type safety
- Compiler feedback for routing mistakes

## Looking for i18n with SSR/TanStack Start?

Check out the guide on integrating [i18n in TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n).
