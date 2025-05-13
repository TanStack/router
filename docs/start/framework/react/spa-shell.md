---
id: spa-shell
title: SPA Shell
---

## What the heck is an SPA Shell?

For applications that do not require SSR for either SEO, crawlers, or performance reasons, it may be desirable to ship a single HTML document to your users containing the "shell" of your application, or more specifically, the bare-minimum `html`, `head`, and `body` tags necessary to bootstrap your application only on the client.

## Why use Start to create an SPA Shell?

**No SSR doesn't mean giving up server-side features!** SPA Shells actually pair very nicely with server-side features like server functions and/or server routes. It **simply means that the initial document will not contain the fully rendered HTML of your application until it has been rendered on the client using JS**.

## Benefits of an SPA Shell

- **Easier to deploy** - A CDN that can serve static assets is all you need.
- **Cheaper** to host - CDNs are cheap compared to Lambda functions or long-running processes.
- **Client-side Only is simpler** - No SSR means less to go wrong with hydration, rendering, and routing.

## Caveats of an SPA Shell

- **Slower time to full content** - Time to full content is longer since all JS must download and execute before anything below the shell can be rendered.
- **Less SEO friendly** - Robots, crawlers and link unfurlers _may_ have a harder time indexing your application unless they are configured to execute JS and your application can render within a reasonable amount of time.

## How does it work?

After enabling the SPA Shell mode, running a Start build will have an additional prerendering step afterwards to generate the shell. This is done by:

- **Prerendering** your application's **root route only**
- Where your application would normally render your matched routes, your router's configured **pending fallback component is rendered instead**.
- The resulting HTML is stored to a static HTML page called `/_shell.html` (configurable)
- Default rewrites are configured to redirect all 404 requests to the SPA shell

## Enabling the SPA Shell

To configure the SPA shell, you can add the following to your Start plugin's options:

```tsx
// vite.config.ts
export default defineConfig({
  plugins: [
    TanStackStart({
      shell: {
        enabled: true,
      },
    }),
  ],
})
```

## Shell Mask Path

The default pathname used to generate the shell is `/`. We call this the **shell mask path**. Since matched routes are not included, the pathname used to generate the shell is mostly irrelevant, but it's still configurable.

> [!NOTE]
> It's recommended to keep the default value of `/` as the shell mask path.

```tsx
// vite.config.ts
export default defineConfig({
  plugins: [
    TanStackStart({
      shell: {
        maskPath: '/app',
      },
    }),
  ],
})
```

## Auto Redirects

When shell mode is enabled, the default behavior is to add a catch-all redirect from all 404 requests to the output shell HTML file. This behavior can be disabled by setting the `autoRedirect` option to `false`.

```tsx
// vite.config.ts
export default defineConfig({
  plugins: [TanStackStart({ shell: { autoRedirect: false } })],
})
```

## Prerendering Options

The prerender option is used to configure the prerendering behavior of the SPA shell, and accepts the same prerender options as found in our prerendering guide.

**By default, the following `prerender` options are set:**

- `outputPath`: `/_shell.html`
- `crawlLinks`: `false`
- `retryCount`: `0`

This means that by default, the shell will not be crawled for links to follow for additional prerendering, and will not retry prerendering fails.

You can always override these options by providing your own prerender options:

```tsx
// vite.config.ts
export default defineConfig({
  plugins: [
    TanStackStart({
      shell: {
        prerender: {
          outputPath: '/custom-shell',
          crawlLinks: true,
          retryCount: 3,
        },
      },
    }),
  ],
})
```

## Customizing the SPA Shell

Customizing the SPA shell can be useful if you want to:

- Provide generic head tags for SPA routes
- Provide a custom pending fallback component
- Change literally anything about the shell's HTML, CSS, and JS

To make this process simple, an `isShell` boolean can be found on the `router` instance:

```tsx
// src/routes/root.tsx
export default function Root() {
  const isShell = useRouter().isShell

  if (isShell) console.log('Rendering the shell!')
}
```

You can use this boolean to conditionally render different UI based on whether the current route is a shell or not, but keep in mind that after hydrating the shell, the router will immediately navigate to the first route and the `isShell` boolean will be `false`. **This could produce flashes of unstyled content if not handled properly.**

## Dynamic Data in your Shell

Since the shell is prerendered using the SSR build of your application, any `loader`s, or server-specific functionality defined on your **Root Route** will run during the prerendering process and the data will be included in the shell.

This means that you can use dynamic data in your shell by using a `loader` or server-specific functionality.

```tsx
// src/routes/__root.tsx

export const RootRoute = createRootRoute({
  loader: async () => {
    return {
      name: 'Tanner',
    }
  },
  component: Root,
})

export default function Root() {
  const { name } = useLoaderData()

  return (
    <html>
      <body>
        <h1>Hello, {name}!</h1>
        <Outlet />
      </body>
    </html>
  )
}
```
