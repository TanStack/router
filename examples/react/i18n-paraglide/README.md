# TanSTack Router example

This example shows how to use Paraglide with TanStack Router. The source code can be found [here](https://github.com/opral/monorepo/tree/main/inlang/packages/paraglide/paraglide-js/examples/tanstack-router).

## Getting started

1. Init Paraglide JS

```bash
npx @inlang/paraglide-js@latest init
```

2. Add the vite plugin to your `vite.config.ts`:

```diff
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
+import { paraglideVitePlugin } from "@inlang/paraglide-js";

export default defineConfig({
	plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
+		paraglideVitePlugin({
+			project: "./project.inlang",
+			outdir: "./app/paraglide",
+		}),
	],
});
```

3. Done :)

Run the app and start translating. See the [basics documentation](/m/gerre34r/library-inlang-paraglideJs/basics) for information on how to use Paraglide's messages, parameters, and locale management.

## Rewrite URL

If you want to handle how the URL looks when the user changes the locale, you can rewrite the URL in the router.

```diff
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
+import { deLocalizeUrl, localizeUrl } from "./paraglide/runtime.js";

const router = createRouter({
  routeTree,
+ rewrite: {
+   input: ({ url }) => deLocalizeUrl(url),
+   output: ({ url }) => localizeUrl(url),
  },
});
```

In `__root.tsx` add a `beforeLoad` hook to check if the user should be redirected and set the html `lang` attribute.

```ts
import { shouldRedirect } from "../paraglide/runtime";

export const Route = createRootRoute({
  beforeLoad: async () => {
    document.documentElement.setAttribute("lang", getLocale());

    const decision = await shouldRedirect({ url: window.location.href });

    if (decision.redirectUrl) {
      throw redirect({ href: decision.redirectUrl.href });
    }
  },
  ...
});
```

## Typesafe translated pathnames

If you don't want to miss any translated path, you can create a `createTranslatedPathnames` function and pass it to the vite plugin.

```ts
import { Locale } from "@/paraglide/runtime";
import { FileRoutesByTo } from "../routeTree.gen";

type RoutePath = keyof FileRoutesByTo;

const excludedPaths = ["admin", "docs", "api"] as const;

type PublicRoutePath = Exclude<
  RoutePath,
  `${string}${(typeof excludedPaths)[number]}${string}`
>;

type TranslatedPathname = {
  pattern: string;
  localized: Array<[Locale, string]>;
};

function toUrlPattern(path: string) {
  return (
    path
      // catch-all
      .replace(/\/\$$/, "/:path(.*)?")
      // optional parameters: {-$param}
      .replace(/\{-\$([a-zA-Z0-9_]+)\}/g, ":$1?")
      // named parameters: $param
      .replace(/\$([a-zA-Z0-9_]+)/g, ":$1")
      // remove trailing slash
      .replace(/\/+$/, "")
  );
}

function createTranslatedPathnames(
  input: Record<PublicRoutePath, Record<Locale, string>>
): TranslatedPathname[] {
  return Object.entries(input).map(([pattern, locales]) => ({
    pattern: toUrlPattern(pattern),
    localized: Object.entries(locales).map(
      ([locale, path]) =>
        [locale as Locale, `/${locale}${toUrlPattern(path)}`] satisfies [
          Locale,
          string,
        ]
    ),
  }));
}

export const translatedPathnames = createTranslatedPathnames({
  "/": {
    en: "/",
    de: "/",
  },
  "/about": {
    en: "/about",
    de: "/ueber",
  },
});
```

And import into the Paraglide Vite plguin.

## Server side rendering

For server side rerdering, check out the [TanStack Start guide](https://inlang.com/m/gerre34r/library-inlang-paraglideJs/tanstack-start).
