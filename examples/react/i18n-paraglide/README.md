### TanStack Router + Paraglide

Paraglide provides type-safe translations, locale detection, and URL localization that pair naturally with TanStack Router.

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

## URL redirects

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
  urlPatterns: translatedPathnames
})
```

This guarantees:

- No missing translations
- Full type safety
- Compiler feedback for routing mistakes

## Looking for i18n with SSR/TanStack Start?

Check out the guide on integrating [i18n in TanStack Start](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n).
