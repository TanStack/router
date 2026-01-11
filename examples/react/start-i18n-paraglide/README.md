### TanStack Start + Paraglide

Paraglide provides type-safe translations, locale detection, and URL localization that pair naturally with TanStack Start.

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

## Type-safe Translated Pathnames

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
    es: "/"
  },
  "/about": {
    en: "/about",
    es: "/nosotros"
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

#### Server Middleware (SSR)

```ts
import { paraglideMiddleware } from './paraglide/server'

export default {
  fetch(req: Request) {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

#### HTML Language Attribute

Set the lang attribute in html at \_\_root.tsx:

```tsx
import { getLocale } from '../paraglide/runtime'

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

### Prerendering Localized Routes

```ts
import { localizeHref } from './paraglide/runtime'

export const prerenderRoutes = ['/', '/about'].map((path) => ({
  path: localizeHref(path),
  prerender: { enabled: true },
}))
```

In vite.config.ts:

```ts
tanstackStart({
  prerender: {
    // Enable prerendering
    enabled: true,

    // Whether to extract links from the HTML and prerender them also
    crawlLinks: true,
  },
  pages: [
    {
      path: '/my-page',
      prerender: { enabled: true, outputPath: '/my-page/index.html' },
    },
  ],
})
```

## Looking for i18n with SSR/TanStack Start?

Check out the guide on integrating [i18n in TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n).
