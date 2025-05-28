# Authenticated Routes

Authentication is an extremely common requirement for web applications. In this guide, we'll walk through how to use TanStack Router to build protected routes, and how to redirect users to login if they try to access them.

## The `route.beforeLoad` Option

The `route.beforeLoad` option allows you to specify a function that will be called before a route is loaded. It receives all of the same arguments that the `route.loader` function does. This is a great place to check if a user is authenticated, and redirect them to a login page if they are not.

The `beforeLoad` function runs in relative order to these other route loading functions:

- Route Matching (Top-Down)
  - `route.params.parse`
  - `route.validateSearch`
- Route Loading (including Preloading)
  - **`route.beforeLoad`**
  - `route.onError`
- Route Loading (Parallel)
  - `route.component.preload?`
  - `route.load`

**It's important to know that the `beforeLoad` function for a route is called _before any of its child routes' `beforeLoad` functions_.** It is essentially a middleware function for the route and all of its children.

**If you throw an error in `beforeLoad`, none of its children will attempt to load**.

## Redirecting

While not required, some authentication flows require redirecting to a login page. To do this, you can **throw a `redirect()`** from `beforeLoad`:

```tsx
// src/routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    if (!isAuthenticated()) {
      throw redirect({
        to: '/login',
        search: {
          // Use the current location to power a redirect after login
          // (Do not use `router.state.resolvedLocation` as it can
          // potentially lag behind the actual current location)
          redirect: location.href,
        },
      })
    }
  },
})
```

> [!TIP]
> The `redirect()` function takes all of the same options as the `navigate` function, so you can pass options like `replace: true` if you want to replace the current history entry instead of adding a new one.

Once you have authenticated a user, it's also common practice to redirect them back to the page they were trying to access. To do this, you can utilize the `redirect` search param that we added in our original redirect. Since we'll be replacing the entire URL with what it was, `router.history.push` is better suited for this than `router.navigate`:

```tsx
router.history.push(search.redirect)
```

## Non-Redirected Authentication

Some applications choose to not redirect users to a login page, and instead keep the user on the same page and show a login form that either replaces the main content or hides it via a modal. This is also possible with TanStack Router by simply short circuiting rendering the `<Outlet />` that would normally render the child routes:

```tsx
// src/routes/_authenticated.tsx
export const Route = createFileRoute('/_authenticated')({
  component: () => {
    if (!isAuthenticated()) {
      return <Login />
    }

    return <Outlet />
  },
})
```

This keeps the user on the same page, but still allows you to render a login form. Once the user is authenticated, you can simply render the `<Outlet />` and the child routes will be rendered.

## Authentication using React context/hooks

If your authentication flow relies on interactions with React context and/or hooks, you'll need to pass down your authentication state to TanStack Router using `router.context` option.

> [!IMPORTANT]
> React hooks are not meant to be consumed outside of React components. If you need to use a hook outside of a React component, you need to extract the returned state from the hook in a component that wraps your `<RouterProvider />` and then pass the returned value down to TanStack Router.

We'll cover the `router.context` options in-detail in the [Router Context](../router-context.md) section.

Here's an example that uses React context and hooks for protecting authenticated routes in TanStack Router. See the entire working setup in the [Authenticated Routes example](https://github.com/TanStack/router/tree/main/examples/react/authenticated-routes).

- `src/routes/__root.tsx`

```tsx
import { createRootRouteWithContext } from '@tanstack/react-router'

interface MyRouterContext {
  // The ReturnType of your useAuth hook or the value of your AuthContext
  auth: AuthState
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => <Outlet />,
})
```

- `src/router.tsx`

```tsx
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    // auth will initially be undefined
    // We'll be passing down the auth state from within a React component
    auth: undefined!,
  },
})
```

- `src/App.tsx`

```tsx
import { RouterProvider } from '@tanstack/react-router'

import { AuthProvider, useAuth } from './auth'

import { router } from './router'

function InnerApp() {
  const auth = useAuth()
  return <RouterProvider router={router} context={{ auth }} />
}

function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  )
}
```

Then in the authenticated route, you can check the auth state using the `beforeLoad` function, and **throw a `redirect()`** to your **Login route** if the user is not signed-in.

- `src/routes/dashboard.route.tsx`

```tsx
import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
})
```

You can _optionally_, also use the [Non-Redirected Authentication](#non-redirected-authentication) approach to show a login form instead of calling a **redirect**.

This approach can also be used in conjunction with Pathless or Layout Route to protect all routes under their parent route.

# Automatic Code Splitting

> [!TIP]
> We'll be filling in this guide soon about the wonderful world of automatic code splitting with TanStack Router and the many customization options available to you. Stay tuned!

<!-- Include the basic configuration details and the code splitting groupings available which were introduced in https://github.com/TanStack/router/pull/3355-->

# Code Splitting

Code splitting and lazy loading is a powerful technique for improving the bundle size and load performance of an application.

- Reduces the amount of code that needs to be loaded on initial page load
- Code is loaded on-demand when it is needed
- Results in more chunks that are smaller in size that can be cached more easily by the browser.

## How does TanStack Router split code?

TanStack Router separates code into two categories:

- **Critical Route Configuration** - The code that is required to render the current route and kick off the data loading process as early as possible.

  - Path Parsing/Serialization
  - Search Param Validation
  - Loaders, Before Load
  - Route Context
  - Static Data
  - Links
  - Scripts
  - Styles
  - All other route configuration not listed below

- **Non-Critical/Lazy Route Configuration** - The code that is not required to match the route, and can be loaded on-demand.
  - Route Component
  - Error Component
  - Pending Component
  - Not-found Component

> 🧠 **Why is the loader not split?**
>
> - The loader is already an asynchronous boundary, so you pay double to both get the chunk _and_ wait for the loader to execute.
> - Categorically, it is less likely to contribute to a large bundle size than a component.
> - The loader is one of the most important preloadable assets for a route, especially if you're using a default preload intent, like hovering over a link, so it's important for the loader to be available without any additional async overhead.
>
>   Knowing the disadvantages of splitting the loader, if you still want to go ahead with it, head over to the [Data Loader Splitting](#data-loader-splitting) section.

## Encapsulating a route's files into a directory

Since TanStack Router's file-based routing system is designed to support both flat and nested file structures, it's possible to encapsulate a route's files into a single directory without any additional configuration.

To encapsulate a route's files into a directory, move the route file itself into a `.route` file within a directory with the same name as the route file.

For example, if you have a route file named `posts.tsx`, you would create a new directory named `posts` and move the `posts.tsx` file into that directory, renaming it to `route.tsx`.

**Before**

- `posts.tsx`

**After**

- `posts`
  - `route.tsx`

## Approaches to code splitting

TanStack Router supports multiple approaches to code splitting. If you are using code-based routing, skip to the [Code-Based Splitting](#code-based-splitting) section.

When you are using file-based routing, you can use the following approaches to code splitting:

- [Using automatic code-splitting ✨](#using-automatic-code-splitting)
- [Using the `.lazy.tsx` suffix](#using-the-lazytsx-suffix)
- [Using Virtual Routes](#using-virtual-routes)

## Using automatic code-splitting✨

This is the easiest and most powerful way to code split your route files.

When using the `autoCodeSplitting` feature, TanStack Router will automatically code split your route files based on the non-critical route configuration mentioned above.

> [!IMPORTANT]
> The automatic code-splitting feature is **ONLY** available when you are using file-based routing with one of our [supported bundlers](../../routing/file-based-routing.md#getting-started-with-file-based-routing).
> This will **NOT** work if you are **only** using the CLI (`@tanstack/router-cli`).

To enable automatic code-splitting, you just need to add the following to the configuration of your TanStack Router Bundler Plugin:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      // ...
      autoCodeSplitting: true,
    }),
    react(), // Make sure to add this plugin after the TanStack Router Bundler plugin
  ],
})
```

That's it! TanStack Router will automatically code-split all your route files by their critical and non-critical route configurations.

If you want more control over the code-splitting process, head over to the [Automatic Code Splitting](../automatic-code-splitting.md) guide to learn more about the options available.

## Using the `.lazy.tsx` suffix

If you are not able to use the automatic code-splitting feature, you can still code-split your route files using the `.lazy.tsx` suffix. It is **as easy as moving your code into a separate file with a `.lazy.tsx` suffix** and using the `createLazyFileRoute` function instead of `createFileRoute`.

> [!IMPORTANT]
> The `__root.tsx` route file, using either `createRootRoute` or `createRootRouteWithContext`, does not support code splitting, since it's always rendered regardless of the current route.

These are the only options that `createLazyFileRoute` support:

| Export Name         | Description                                                           |
| ------------------- | --------------------------------------------------------------------- |
| `component`         | The component to render for the route.                                |
| `errorComponent`    | The component to render when an error occurs while loading the route. |
| `pendingComponent`  | The component to render while the route is loading.                   |
| `notFoundComponent` | The component to render if a not-found error gets thrown.             |

### Example code splitting with `.lazy.tsx`

When you are using `.lazy.tsx` you can split your route into two files to enable code splitting:

**Before (Single File)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: Posts,
})

function Posts() {
  // ...
}
```

**After (Split into two files)**

This file would contain the critical route configuration:

```tsx
// src/routes/posts.tsx

import { createFileRoute } from '@tanstack/react-router'
import { fetchPosts } from './api'

export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
})
```

With the non-critical route configuration going into the file with the `.lazy.tsx` suffix:

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

## Using Virtual Routes

You might run into a situation where you end up splitting out everything from a route file, leaving it empty! In this case, simply **delete the route file entirely**! A virtual route will automatically be generated for you to serve as an anchor for your code split files. This virtual route will live directly in the generated route tree file.

**Before (Virtual Routes)**

```tsx
// src/routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  // Hello?
})
```

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

**After (Virtual Routes)**

```tsx
// src/routes/posts.lazy.tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/posts')({
  component: Posts,
})

function Posts() {
  // ...
}
```

Tada! 🎉

## Code-Based Splitting

If you are using code-based routing, you can still code-split your routes using the `Route.lazy()` method and the `createLazyRoute` function. You'll need to split your route configuration into two parts:

Create a lazy route using the `createLazyRoute` function.

```tsx
// src/posts.tsx
export const Route = createLazyRoute('/posts')({
  component: MyComponent,
})

function MyComponent() {
  return <div>My Component</div>
}
```

Then, call the `.lazy` method on the route definition in your `app.tsx` to import the lazy/code-split route with the non-critical route configuration.

```tsx
// src/app.tsx
const postsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/posts',
}).lazy(() => import('./posts.lazy').then((d) => d.Route))
```

## Data Loader Splitting

**Be warned!!!** Splitting a route loader is a dangerous game.

It can be a powerful tool to reduce bundle size, but it comes with a cost as mentioned in the [How does TanStack Router split code?](#how-does-tanstack-router-split-code) section.

You can code split your data loading logic using the Route's `loader` option. While this process makes it difficult to maintain type-safety with the parameters passed to your loader, you can always use the generic `LoaderContext` type to get you most of the way there:

```tsx
import { lazyFn } from '@tanstack/react-router'

const route = createRoute({
  path: '/my-route',
  component: MyComponent,
  loader: lazyFn(() => import('./loader'), 'loader'),
})

// In another file...a
export const loader = async (context: LoaderContext) => {
  /// ...
}
```

If you are using file-based routing, you'll only be able to split your `loader` if you are using [Automatic Code Splitting](#using-automatic-code-splitting) with customized bundling options.

## Manually accessing Route APIs in other files with the `getRouteApi` helper

As you might have guessed, placing your component code in a separate file than your route can make it difficult to consume the route itself. To help with this, TanStack Router exports a handy `getRouteApi` function that you can use to access a route's type-safe APIs in a file without importing the route itself.

- `my-route.tsx`

```tsx
import { createRoute } from '@tanstack/react-router'
import { MyComponent } from './MyComponent'

const route = createRoute({
  path: '/my-route',
  loader: () => ({
    foo: 'bar',
  }),
  component: MyComponent,
})
```

- `MyComponent.tsx`

```tsx
import { getRouteApi } from '@tanstack/react-router'

const route = getRouteApi('/my-route')

export function MyComponent() {
  const loaderData = route.useLoaderData()
  //    ^? { foo: string }

  return <div>...</div>
}
```

The `getRouteApi` function is useful for accessing other type-safe APIs:

- `useLoaderData`
- `useLoaderDeps`
- `useMatch`
- `useParams`
- `useRouteContext`
- `useSearch`

# Creating a Router

## The `Router` Class

When you're ready to start using your router, you'll need to create a new `Router` instance. The router instance is the core brains of TanStack Router and is responsible for managing the route tree, matching routes, and coordinating navigations and route transitions. It also serves as a place to configure router-wide settings.

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
})
```

## Route Tree

You'll probably notice quickly that the `Router` constructor requires a `routeTree` option. This is the route tree that the router will use to match routes and render components.

Whether you used [file-based routing](../../routing/file-based-routing.md) or [code-based routing](../../routing/code-based-routing.md), you'll need to pass your route tree to the `createRouter` function:

### Filesystem Route Tree

If you used our recommended file-based routing, then it's likely your generated route tree file was created at the default `src/routeTree.gen.ts` location. If you used a custom location, then you'll need to import your route tree from that location.

```tsx
import { routeTree } from './routeTree.gen'
```

### Code-Based Route Tree

If you used code-based routing, then you likely created your route tree manually using the root route's `addChildren` method:

```tsx
const routeTree = rootRoute.addChildren([
  // ...
])
```

## Router Type Safety

> [!IMPORTANT]
> DO NOT SKIP THIS SECTION! ⚠️

TanStack Router provides amazing support for TypeScript, even for things you wouldn't expect like bare imports straight from the library! To make this possible, you must register your router's types using TypeScripts' [Declaration Merging](https://www.typescriptlang.org/docs/handbook/declaration-merging.html) feature. This is done by extending the `Register` interface on `@tanstack/react-router` with a `router` property that has the type of your `router` instance:

```tsx
declare module '@tanstack/react-router' {
  interface Register {
    // This infers the type of our router and registers it across your entire project
    router: typeof router
  }
}
```

With your router registered, you'll now get type-safety across your entire project for anything related to routing.

## 404 Not Found Route

As promised in earlier guides, we'll now cover the `notFoundRoute` option. This option is used to configure a route that will render when no other suitable match is found. This is useful for rendering a 404 page or redirecting to a default route.

If you are using either file-based or code-based routing, then you'll need to add a `notFoundComponent` key to `createRootRoute`:

```tsx
export const Route = createRootRoute({
  component: () => (
    // ...
  ),
  notFoundComponent: () => <div>404 Not Found</div>,
});
```

## Other Options

There are many other options that can be passed to the `Router` constructor. You can find a full list of them in the [API Reference](../../api/router/RouterOptionsType.md).

# Custom Link

While repeating yourself can be acceptable in many situations, you might find that you do it too often. At times, you may want to create cross-cutting components with additional behavior or styles. You might also consider using third-party libraries in combination with TanStack Router's type safety.

## `createLink` for cross-cutting concerns

`createLink` creates a custom `Link` component with the same type parameters as `Link`. This means you can create your own component which provides the same type safety and typescript performance as `Link`.

### Basic example

If you want to create a basic custom link component, you can do so with the following:

[//]: # 'BasicExampleImplementation'

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'

interface BasicLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  // Add any additional props you want to pass to the anchor element
}

const BasicLinkComponent = React.forwardRef<HTMLAnchorElement, BasicLinkProps>(
  (props, ref) => {
    return (
      <a ref={ref} {...props} className={'block px-3 py-2 text-blue-700'} />
    )
  },
)

const CreatedLinkComponent = createLink(BasicLinkComponent)

export const CustomLink: LinkComponent<typeof BasicLinkComponent> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}
```

[//]: # 'BasicExampleImplementation'

You can then use your newly created `Link` component as any other `Link`

```tsx
<CustomLink to={'/dashboard/invoices/$invoiceId'} params={{ invoiceId: 0 }} />
```

[//]: # 'ExamplesUsingThirdPartyLibs'

## `createLink` with third party libraries

Here are some examples of how you can use `createLink` with third-party libraries.

### React Aria Components example

React Aria Components'
[Link](https://react-spectrum.adobe.com/react-aria/Link.html) component does not support the standard `onMouseEnter` and `onMouseLeave` events.
Therefore, you cannot use it directly with TanStack Router's `preload (intent)` prop.

Explanation for this can be found here:

- [https://react-spectrum.adobe.com/react-aria/interactions.html](https://react-spectrum.adobe.com/react-aria/interactions.html)
- [https://react-spectrum.adobe.com/blog/building-a-button-part-2.html](https://react-spectrum.adobe.com/blog/building-a-button-part-2.html)

It is possible to work around this by using the [useLink](https://react-spectrum.adobe.com/react-aria/useLink.html) hook from [React Aria Hooks](https://react-spectrum.adobe.com/react-aria/hooks.html) with a standard anchor element.

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import {
  mergeProps,
  useFocusRing,
  useHover,
  useLink,
  useObjectRef,
} from 'react-aria'
import type { AriaLinkOptions } from 'react-aria'

interface RACLinkProps extends Omit<AriaLinkOptions, 'href'> {
  children?: React.ReactNode
}

const RACLinkComponent = React.forwardRef<HTMLAnchorElement, RACLinkProps>(
  (props, forwardedRef) => {
    const ref = useObjectRef(forwardedRef)

    const { isPressed, linkProps } = useLink(props, ref)
    const { isHovered, hoverProps } = useHover(props)
    const { isFocusVisible, isFocused, focusProps } = useFocusRing(props)

    return (
      <a
        {...mergeProps(linkProps, hoverProps, focusProps, props)}
        ref={ref}
        data-hovered={isHovered || undefined}
        data-pressed={isPressed || undefined}
        data-focus-visible={isFocusVisible || undefined}
        data-focused={isFocused || undefined}
      />
    )
  },
)

const CreatedLinkComponent = createLink(RACLinkComponent)

export const CustomLink: LinkComponent<typeof RACLinkComponent> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}
```

### Chakra UI example

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import { Link } from '@chakra-ui/react'

interface ChakraLinkProps
  extends Omit<React.ComponentPropsWithoutRef<typeof Link>, 'href'> {
  // Add any additional props you want to pass to the link
}

const ChakraLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  ChakraLinkProps
>((props, ref) => {
  return <Link ref={ref} {...props} />
})

const CreatedLinkComponent = createLink(ChakraLinkComponent)

export const CustomLink: LinkComponent<typeof ChakraLinkComponent> = (
  props,
) => {
  return (
    <CreatedLinkComponent
      textDecoration={'underline'}
      _hover={{ textDecoration: 'none' }}
      _focus={{ textDecoration: 'none' }}
      preload={'intent'}
      {...props}
    />
  )
}
```

### MUI example

There is an [example](https://github.com/TanStack/router/tree/main/examples/react/start-material-ui) available which uses these patterns.

#### `Link`

If the MUI `Link` should simply behave like the router `Link`, it can be just wrapped with `createLink`:

```tsx
import { createLink } from '@tanstack/react-router'
import { Link } from '@mui/material'

export const CustomLink = createLink(Link)
```

If the `Link` should be customized this approach can be used:

```tsx
import React from 'react'
import { createLink } from '@tanstack/react-router'
import { Link } from '@mui/material'
import type { LinkProps } from '@mui/material'
import type { LinkComponent } from '@tanstack/react-router'

interface MUILinkProps extends LinkProps {
  // Add any additional props you want to pass to the Link
}

const MUILinkComponent = React.forwardRef<HTMLAnchorElement, MUILinkProps>(
  (props, ref) => <Link ref={ref} {...props} />,
)

const CreatedLinkComponent = createLink(MUILinkComponent)

export const CustomLink: LinkComponent<typeof MUILinkComponent> = (props) => {
  return <CreatedLinkComponent preload={'intent'} {...props} />
}

// Can also be styled
```

#### `Button`

If a `Button` should be used as a router `Link`, the `component` should be set as `a`:

```tsx
import React from 'react'
import { createLink } from '@tanstack/react-router'
import { Button } from '@mui/material'
import type { ButtonProps } from '@mui/material'
import type { LinkComponent } from '@tanstack/react-router'

interface MUIButtonLinkProps extends ButtonProps<'a'> {
  // Add any additional props you want to pass to the Button
}

const MUIButtonLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  MUIButtonLinkProps
>((props, ref) => <Button ref={ref} component="a" {...props} />)

const CreatedButtonLinkComponent = createLink(MUIButtonLinkComponent)

export const CustomButtonLink: LinkComponent<typeof MUIButtonLinkComponent> = (
  props,
) => {
  return <CreatedButtonLinkComponent preload={'intent'} {...props} />
}
```

#### Usage with `styled`

Any of these MUI approaches can then be used with `styled`:

```tsx
import { css, styled } from '@mui/material'
import { CustomLink } from './CustomLink'

const StyledCustomLink = styled(CustomLink)(
  ({ theme }) => css`
    color: ${theme.palette.common.white};
  `,
)
```

### Mantine example

```tsx
import * as React from 'react'
import { createLink, LinkComponent } from '@tanstack/react-router'
import { Anchor, AnchorProps } from '@mantine/core'

interface MantineAnchorProps extends Omit<AnchorProps, 'href'> {
  // Add any additional props you want to pass to the anchor
}

const MantineLinkComponent = React.forwardRef<
  HTMLAnchorElement,
  MantineAnchorProps
>((props, ref) => {
  return <Anchor ref={ref} {...props} />
})

const CreatedLinkComponent = createLink(MantineLinkComponent)

export const CustomLink: LinkComponent<typeof MantineLinkComponent> = (
  props,
) => {
  return <CreatedLinkComponent preload="intent" {...props} />
}
```

[//]: # 'ExamplesUsingThirdPartyLibs'

# Custom Search Param Serialization

By default, TanStack Router parses and serializes your URL Search Params automatically using `JSON.stringify` and `JSON.parse`. This process involves escaping and unescaping the search string, which is a common practice for URL search params, in addition to the serialization and deserialization of the search object.

For instance, using the default configuration, if you have the following search object:

```tsx
const search = {
  page: 1,
  sort: 'asc',
  filters: { author: 'tanner', min_words: 800 },
}
```

It would be serialized and escaped into the following search string:

```txt
?page=1&sort=asc&filters=%7B%22author%22%3A%22tanner%22%2C%22min_words%22%3A800%7D
```

We can implement the default behavior with the following code:

```tsx
import {
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'

const router = createRouter({
  // ...
  parseSearch: parseSearchWith(JSON.parse),
  stringifySearch: stringifySearchWith(JSON.stringify),
})
```

However, this default behavior may not be suitable for all use cases. For example, you may want to use a different serialization format, such as base64 encoding, or you may want to use a purpose-built serialization/deserialization library, like [query-string](https://github.com/sindresorhus/query-string), [JSURL2](https://github.com/wmertens/jsurl2), or [Zipson](https://jgranstrom.github.io/zipson/).

This can be achieved by providing your own serialization and deserialization functions to the `parseSearch` and `stringifySearch` options in the [`Router`](../../api/router/RouterOptionsType.md#stringifysearch-method) configuration. When doing this, you can utilize TanStack Router's built-in helper functions, `parseSearchWith` and `stringifySearchWith`, to simplify the process.

> [!TIP]
> An important aspect of serialization and deserialization, is that you are able to get the same object back after deserialization. This is important because if the serialization and deserialization process is not done correctly, you may lose some information. For example, if you are using a library that does not support nested objects, you may lose the nested object when deserializing the search string.

![Diagram showing idempotent nature of URL search param serialization and deserialization](https://raw.githubusercontent.com/TanStack/router/main/docs/router/assets/search-serialization-deserialization-idempotency.jpg)

Here are some examples of how you can customize the search param serialization in TanStack Router:

## Using Base64

It's common to base64 encode your search params to achieve maximum compatibility across browsers and URL unfurlers, etc. This can be done with the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'

const router = createRouter({
  parseSearch: parseSearchWith((value) => JSON.parse(decodeFromBinary(value))),
  stringifySearch: stringifySearchWith((value) =>
    encodeToBinary(JSON.stringify(value)),
  ),
})

function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}

function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

> [⚠️ Why does this snippet not use atob/btoa?](#safe-binary-encodingdecoding)

So, if we were to turn the previous object into a search string using this configuration, it would look like this:

```txt
?page=1&sort=asc&filters=eyJhdXRob3IiOiJ0YW5uZXIiLCJtaW5fd29yZHMiOjgwMH0%3D
```

> [!WARNING]
> If you are serializing user input into Base64, you run the risk of causing a collision with the URL deserialization. This can lead to unexpected behavior, such as the URL not being parsed correctly or being interpreted as a different value. To avoid this, you should encode the search params using a safe binary encoding/decoding method (see below).

## Using the query-string library

The [query-string](https://github.com/sindresorhus/query-string) library is a popular for being able to reliably parse and stringify query strings. You can use it to customize the serialization format of your search params. This can be done with the following code:

```tsx
import { createRouter } from '@tanstack/react-router'
import qs from 'query-string'

const router = createRouter({
  // ...
  stringifySearch: stringifySearchWith((value) =>
    qs.stringify(value, {
      // ...options
    }),
  ),
  parseSearch: parseSearchWith((value) =>
    qs.parse(value, {
      // ...options
    }),
  ),
})
```

So, if we were to turn the previous object into a search string using this configuration, it would look like this:

```txt
?page=1&sort=asc&filters=author%3Dtanner%26min_words%3D800
```

## Using the JSURL2 library

[JSURL2](https://github.com/wmertens/jsurl2) is a non-standard library that can compress URLs while still maintaining readability. This can be done with the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'
import { parse, stringify } from 'jsurl2'

const router = createRouter({
  // ...
  parseSearch: parseSearchWith(parse),
  stringifySearch: stringifySearchWith(stringify),
})
```

So, if we were to turn the previous object into a search string using this configuration, it would look like this:

```txt
?page=1&sort=asc&filters=(author~tanner~min*_words~800)~
```

## Using the Zipson library

[Zipson](https://jgranstrom.github.io/zipson/) is a very user-friendly and performant JSON compression library (both in runtime performance and the resulting compression performance). To compress your search params with it (which requires escaping/unescaping and base64 encoding/decoding them as well), you can use the following code:

```tsx
import {
  Router,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router'
import { stringify, parse } from 'zipson'

const router = createRouter({
  parseSearch: parseSearchWith((value) => parse(decodeFromBinary(value))),
  stringifySearch: stringifySearchWith((value) =>
    encodeToBinary(stringify(value)),
  ),
})

function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}

function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

> [⚠️ Why does this snippet not use atob/btoa?](#safe-binary-encodingdecoding)

So, if we were to turn the previous object into a search string using this configuration, it would look like this:

```txt
?page=1&sort=asc&filters=JTdCJUMyJUE4YXV0aG9yJUMyJUE4JUMyJUE4dGFubmVyJUMyJUE4JUMyJUE4bWluX3dvcmRzJUMyJUE4JUMyJUEyQ3UlN0Q%3D
```

<hr>

### Safe Binary Encoding/Decoding

In the browser, the `atob` and `btoa` functions are not guaranteed to work properly with non-UTF8 characters. We recommend using these encoding/decoding utilities instead:

To encode from a string to a binary string:

```typescript
export function encodeToBinary(str: string): string {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode(parseInt(p1, 16))
    }),
  )
}
```

To decode from a binary string to a string:

```typescript
export function decodeFromBinary(str: string): string {
  return decodeURIComponent(
    Array.prototype.map
      .call(atob(str), function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)
      })
      .join(''),
  )
}
```

# Data Loading

Data loading is a common concern for web applications and is related to routing. When loading a page for your app, it's ideal if all of the page's async requirements are fetched and fulfilled as early as possible, in parallel. The router is the best place to coordinate these async dependencies as it's usually the only place in your app that knows where users are headed before content is rendered.

You may be familiar with `getServerSideProps` from Next.js or `loader`s from Remix/React-Router. TanStack Router has similar functionality to preload/load assets on a per-route basis in parallel allowing it to render as quickly as possible as it fetches via suspense.

Beyond these normal expectations of a router, TanStack Router goes above and beyond and provides **built-in SWR Caching**, a long-term in-memory caching layer for route loaders. This means that you can use TanStack Router to both preload data for your routes so they load instantaneously or temporarily cache route data for previously visited routes to use again later.

## The route loading lifecycle

Every time a URL/history update is detected, the router executes the following sequence:

- Route Matching (Top-Down)
  - `route.params.parse`
  - `route.validateSearch`
- Route Pre-Loading (Serial)
  - `route.beforeLoad`
  - `route.onError`
    - `route.errorComponent` / `parentRoute.errorComponent` / `router.defaultErrorComponent`
- Route Loading (Parallel)
  - `route.component.preload?`
  - `route.loader`
    - `route.pendingComponent` (Optional)
    - `route.component`
  - `route.onError`
    - `route.errorComponent` / `parentRoute.errorComponent` / `router.defaultErrorComponent`

## To Router Cache or not to Router Cache?

There is a high possibility that TanStack's router cache will be a good fit for most smaller to medium size applications, but it's important to understand the tradeoffs of using it vs a more robust caching solution like TanStack Query:

TanStack Router Cache Pros:

- Built-in, easy to use, no extra dependencies
- Handles deduping, preloading, loading, stale-while-revalidate, background refetching on a per-route basis
- Coarse invalidation (invalidate all routes and cache at once)
- Automatic garbage collection
- Works great for apps that share little data between routes
- "Just works" for SSR

TanStack Router Cache Cons:

- No persistence adapters/model
- No shared caching/deduping between routes
- No built-in mutation APIs (a basic `useMutation` hook is provided in many examples that may be sufficient for many use cases)
- No built-in cache-level optimistic update APIs (you can still use ephemeral state from something like a `useMutation` hook to achieve this at the component level)

> [!TIP]
> If you know right away that you'd like to or need to use something more robust like TanStack Query, skip to the [External Data Loading](../external-data-loading.md) guide.

## Using the Router Cache

The router cache is built-in and is as easy as returning data from any route's `loader` function. Let's learn how!

## Route `loader`s

Route `loader` functions are called when a route match is loaded. They are called with a single parameter which is an object containing many helpful properties. We'll go over those in a bit, but first, let's look at an example of a route `loader` function:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
})
```

## `loader` Parameters

The `loader` function receives a single object with the following properties:

- `abortController` - The route's abortController. Its signal is cancelled when the route is unloaded or when the Route is no longer relevant and the current invocation of the `loader` function becomes outdated.
- `cause` - The cause of the current route match, either `enter` or `stay`.
- `context` - The route's context object, which is a merged union of:
  - Parent route context
  - This route's context as provided by the `beforeLoad` option
- `deps` - The object value returned from the `Route.loaderDeps` function. If `Route.loaderDeps` is not defined, an empty object will be provided instead.
- `location` - The current location
- `params` - The route's path params
- `parentMatchPromise` - `Promise<RouteMatch>` (`undefined` for the root route)
- `preload` - Boolean which is `true` when the route is being preloaded instead of loaded
- `route` - The route itself

Using these parameters, we can do a lot of cool things, but first, let's take a look at how we can control it and when the `loader` function is called.

## Consuming data from `loader`s

To consume data from a `loader`, use the `useLoaderData` hook defined on your Route object.

```tsx
const posts = Route.useLoaderData()
```

If you don't have ready access to your route object (i.e. you're deep in the component tree for the current route), you can use `getRouteApi` to access the same hook (as well as the other hooks on the Route object). This should be preferred over importing the Route object, which is likely to create circular dependencies.

```tsx
import { getRouteApi } from '@tanstack/react-router'

// in your component

const routeApi = getRouteApi('/posts')
const data = routeApi.useLoaderData()
```

## Dependency-based Stale-While-Revalidate Caching

TanStack Router provides a built-in Stale-While-Revalidate caching layer for route loaders that is keyed on the dependencies of a route:

- The route's fully parsed pathname
  - e.g. `/posts/1` vs `/posts/2`
- Any additional dependencies provided by the `loaderDeps` option
  - e.g. `loaderDeps: ({ search: { pageIndex, pageSize } }) => ({ pageIndex, pageSize })`

Using these dependencies as keys, TanStack Router will cache the data returned from a route's `loader` function and use it to fulfill subsequent requests for the same route match. This means that if a route's data is already in the cache, it will be returned immediately, then **potentially** be refetched in the background depending on the "freshness" of the data.

### Key options

To control router dependencies and "freshness", TanStack Router provides a plethora of options to control the keying and caching behavior of your route loaders. Let's take a look at them in the order that you are most likely to use them:

- `routeOptions.loaderDeps`
  - A function that supplies you the search params for a router and returns an object of dependencies for use in your `loader` function. When these deps changed from navigation to navigation, it will cause the route to reload regardless of `staleTime`s. The deps are compared using a deep equality check.
- `routeOptions.staleTime`
- `routerOptions.defaultStaleTime`
  - The number of milliseconds that a route's data should be considered fresh when attempting to load.
- `routeOptions.preloadStaleTime`
- `routerOptions.defaultPreloadStaleTime`
  - The number of milliseconds that a route's data should be considered fresh attempting to preload.
- `routeOptions.gcTime`
- `routerOptions.defaultGcTime`
  - The number of milliseconds that a route's data should be kept in the cache before being garbage collected.
- `routeOptions.shouldReload`
  - A function that receives the same `beforeLoad` and `loaderContext` parameters and returns a boolean indicating if the route should reload. This offers one more level of control over when a route should reload beyond `staleTime` and `loaderDeps` and can be used to implement patterns similar to Remix's `shouldLoad` option.

### ⚠️ Some Important Defaults

- By default, the `staleTime` is set to `0`, meaning that the route's data will always be considered stale and will always be reloaded in the background when the route is rematched.
- By default, a previously preloaded route is considered fresh for **30 seconds**. This means if a route is preloaded, then preloaded again within 30 seconds, the second preload will be ignored. This prevents unnecessary preloads from happening too frequently. **When a route is loaded normally, the standard `staleTime` is used.**
- By default, the `gcTime` is set to **30 minutes**, meaning that any route data that has not been accessed in 30 minutes will be garbage collected and removed from the cache.
- `router.invalidate()` will force all active routes to reload their loaders immediately and mark every cached route's data as stale.

### Using `loaderDeps` to access search params

Imagine a `/posts` route supports some pagination via search params `offset` and `limit`. For the cache to uniquely store this data, we need to access these search params via the `loaderDeps` function. By explicitly identifying them, each route match for `/posts` with different `offset` and `limit` won't get mixed up!

Once we have these deps in place, the route will always reload when the deps change.

```tsx
// /routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loaderDeps: ({ search: { offset, limit } }) => ({ offset, limit }),
  loader: ({ deps: { offset, limit } }) =>
    fetchPosts({
      offset,
      limit,
    }),
})
```

### Using `staleTime` to control how long data is considered fresh

By default, `staleTime` for navigations is set to `0`ms (and 30 seconds for preloads) which means that the route's data will always be considered stale and will always be reloaded in the background when the route is matched and navigated to.

**This is a good default for most use cases, but you may find that some route data is more static or potentially expensive to load.** In these cases, you can use the `staleTime` option to control how long the route's data is considered fresh for navigations. Let's take a look at an example:

```tsx
// /routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  // Consider the route's data fresh for 10 seconds
  staleTime: 10_000,
})
```

By passing `10_000` to the `staleTime` option, we are telling the router to consider the route's data fresh for 10 seconds. This means that if the user navigates to `/posts` from `/about` within 10 seconds of the last loader result, the route's data will not be reloaded. If the user then navigates to `/posts` from `/about` after 10 seconds, the route's data will be reloaded **in the background**.

## Turning off stale-while-revalidate caching

To disable stale-while-revalidate caching for a route, set the `staleTime` option to `Infinity`:

```tsx
// /routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  staleTime: Infinity,
})
```

You can even turn this off for all routes by setting the `defaultStaleTime` option on the router:

```tsx
const router = createRouter({
  routeTree,
  defaultStaleTime: Infinity,
})
```

## Using `shouldReload` and `gcTime` to opt-out of caching

Similar to Remix's default functionality, you may want to configure a route to only load on entry or when critical loader deps change. You can do this by using the `gcTime` option combined with the `shouldReload` option, which accepts either a `boolean` or a function that receives the same `beforeLoad` and `loaderContext` parameters and returns a boolean indicating if the route should reload.

```tsx
// /routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loaderDeps: ({ search: { offset, limit } }) => ({ offset, limit }),
  loader: ({ deps }) => fetchPosts(deps),
  // Do not cache this route's data after it's unloaded
  gcTime: 0,
  // Only reload the route when the user navigates to it or when deps change
  shouldReload: false,
})
```

### Opting out of caching while still preloading

Even though you may opt-out of short-term caching for your route data, you can still get the benefits of preloading! With the above configuration, preloading will still "just work" with the default `preloadGcTime`. This means that if a route is preloaded, then navigated to, the route's data will be considered fresh and will not be reloaded.

To opt out of preloading, don't turn it on via the `routerOptions.defaultPreload` or `routeOptions.preload` options.

## Passing all loader events to an external cache

We break down this use case in the [External Data Loading](../external-data-loading.md) page, but if you'd like to use an external cache like TanStack Query, you can do so by passing all loader events to your external cache. As long as you are using the defaults, the only change you'll need to make is to set the `defaultPreloadStaleTime` option on the router to `0`:

```tsx
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
})
```

This will ensure that every preload, load, and reload event will trigger your `loader` functions, which can then be handled and deduped by your external cache.

## Using Router Context

The `context` argument passed to the `loader` function is an object containing a merged union of:

- Parent route context
- This route's context as provided by the `beforeLoad` option

Starting at the very top of the router, you can pass an initial context to the router via the `context` option. This context will be available to all routes in the router and get copied and extended by each route as they are matched. This happens by passing a context to a route via the `beforeLoad` option. This context will be available to all the route's child routes. The resulting context will be available to the route's `loader` function.

In this example, we'll create a function in our route context to fetch posts, then use it in our `loader` function.

> 🧠 Context is a powerful tool for dependency injection. You can use it to inject services, hooks, and other objects into your router and routes. You can also additively pass data down the route tree at every route using a route's `beforeLoad` option.

- `/utils/fetchPosts.tsx`

```tsx
export const fetchPosts = async () => {
  const res = await fetch(`/api/posts?page=${pageIndex}`)
  if (!res.ok) throw new Error('Failed to fetch posts')
  return res.json()
}
```

- `/routes/__root.tsx`

```tsx
import { createRootRouteWithContext } from '@tanstack/react-router'

// Create a root route using the createRootRouteWithContext<{...}>() function and pass it whatever types you would like to be available in your router context.
export const Route = createRootRouteWithContext<{
  fetchPosts: typeof fetchPosts
}>()() // NOTE: the double call is on purpose, since createRootRouteWithContext is a factory ;)
```

- `/routes/posts.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

// Notice how our postsRoute references context to get our fetchPosts function
// This can be a powerful tool for dependency injection across your router
// and routes.
export const Route = createFileRoute('/posts')({
  loader: ({ context: { fetchPosts } }) => fetchPosts(),
})
```

- `/router.tsx`

```tsx
import { routeTree } from './routeTree.gen'

// Use your routerContext to create a new router
// This will require that you fullfil the type requirements of the routerContext
const router = createRouter({
  routeTree,
  context: {
    // Supply the fetchPosts function to the router context
    fetchPosts,
  },
})
```

## Using Path Params

To use path params in your `loader` function, access them via the `params` property on the function's parameters. Here's an example:

```tsx
// routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params: { postId } }) => fetchPostById(postId),
})
```

## Using Route Context

Passing down global context to your router is great, but what if you want to provide context that is specific to a route? This is where the `beforeLoad` option comes in. The `beforeLoad` option is a function that runs right before attempting to load a route and receives the same parameters as `loader`. Beyond its ability to redirect potential matches, block loader requests, etc, it can also return an object that will be merged into the route's context. Let's take a look at an example where we inject some data into our route context via the `beforeLoad` option:

```tsx
// /routes/posts.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  // Pass the fetchPosts function to the route context
  beforeLoad: () => ({
    fetchPosts: () => console.info('foo'),
  }),
  loader: ({ context: { fetchPosts } }) => {
    console.info(fetchPosts()) // 'foo'

    // ...
  },
})
```

## Using Search Params in Loaders

> ❓ But wait Tanner... where the heck are my search params?!

You might be here wondering why `search` isn't directly available in the `loader` function's parameters. We've purposefully designed it this way to help you succeed. Let's take a look at why:

- Search Parameters being used in a loader function are a very good indicator that those search params should also be used to uniquely identify the data being loaded. For example, you may have a route that uses a search param like `pageIndex` that uniquely identifies the data held inside of the route match. Or, imagine a `/users/user` route that uses the search param `userId` to identify a specific user in your application, you might model your url like this: `/users/user?userId=123`. This means that your `user` route would need some extra help to identify a specific user.
- Directly accessing search params in a loader function can lead to bugs in caching and preloading where the data being loaded is not unique to the current URL pathname and search params. For example, you might ask your `/posts` route to preload page 2's results, but without the distinction of pages in your route configuration, you will end up fetching, storing and displaying page 2's data on your `/posts` or `?page=1` screen instead of it preloading in the background!
- Placing a threshold between search parameters and the loader function allows the router to understand your dependencies and reactivity.

```tsx
// /routes/users.user.tsx
export const Route = createFileRoute('/users/user')({
  validateSearch: (search) =>
    search as {
      userId: string
    },
  loaderDeps: ({ search: { userId } }) => ({
    userId,
  }),
  loader: async ({ deps: { userId } }) => getUser(userId),
})
```

### Accessing Search Params via `routeOptions.loaderDeps`

```tsx
// /routes/posts.tsx
export const Route = createFileRoute('/posts')({
  // Use zod to validate and parse the search params
  validateSearch: z.object({
    offset: z.number().int().nonnegative().catch(0),
  }),
  // Pass the offset to your loader deps via the loaderDeps function
  loaderDeps: ({ search: { offset } }) => ({ offset }),
  // Use the offset from context in the loader function
  loader: async ({ deps: { offset } }) =>
    fetchPosts({
      offset,
    }),
})
```

## Using the Abort Signal

The `abortController` property of the `loader` function is an [AbortController](https://developer.mozilla.org/en-US/docs/Web/API/AbortController). Its signal is cancelled when the route is unloaded or when the `loader` call becomes outdated. This is useful for cancelling network requests when the route is unloaded or when the route's params change. Here is an example using it with a fetch call:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: ({ abortController }) =>
    fetchPosts({
      // Pass this to an underlying fetch call or anything that supports signals
      signal: abortController.signal,
    }),
})
```

## Using the `preload` flag

The `preload` property of the `loader` function is a boolean which is `true` when the route is being preloaded instead of loaded. Some data loading libraries may handle preloading differently than a standard fetch, so you may want to pass `preload` to your data loading library, or use it to execute the appropriate data loading logic:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: async ({ preload }) =>
    fetchPosts({
      maxAge: preload ? 10_000 : 0, // Preloads should hang around a bit longer
    }),
})
```

## Handling Slow Loaders

Ideally most route loaders can resolve their data within a short moment, removing the need to render a placeholder spinner and simply rely on suspense to render the next route when it's completely ready. When critical data that is required to render a route's component is slow though, you have 2 options:

- Split up your fast and slow data into separate promises and `defer` the slow data until after the fast data is loaded (see the [Deferred Data Loading](../deferred-data-loading.md) guide).
- Show a pending component after an optimistic suspense threshold until all of the data is ready (See below).

## Showing a pending component

**By default, TanStack Router will show a pending component for loaders that take longer than 1 second to resolve.** This is an optimistic threshold that can be configured via:

- `routeOptions.pendingMs` or
- `routerOptions.defaultPendingMs`

When the pending time threshold is exceeded, the router will render the `pendingComponent` option of the route, if configured.

## Avoiding Pending Component Flash

If you're using a pending component, the last thing you want is for your pending time threshold to be met, then have your data resolve immediately after, resulting in a jarring flash of your pending component. To avoid this, **TanStack Router by default will show your pending component for at least 500ms**. This is an optimistic threshold that can be configured via:

- `routeOptions.pendingMinMs` or
- `routerOptions.defaultPendingMinMs`

## Handling Errors

TanStack Router provides a few ways to handle errors that occur during the route loading lifecycle. Let's take a look at them.

### Handling Errors with `routeOptions.onError`

The `routeOptions.onError` option is a function that is called when an error occurs during the route loading.

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  onError: ({ error }) => {
    // Log the error
    console.error(error)
  },
})
```

### Handling Errors with `routeOptions.onCatch`

The `routeOptions.onCatch` option is a function that is called whenever an error was caught by the router's CatchBoundary.

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  onCatch: ({ error, errorInfo }) => {
    // Log the error
    console.error(error)
  },
})
```

### Handling Errors with `routeOptions.errorComponent`

The `routeOptions.errorComponent` option is a component that is rendered when an error occurs during the route loading or rendering lifecycle. It is rendered with the following props:

- `error` - The error that occurred
- `reset` - A function to reset the internal `CatchBoundary`

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  errorComponent: ({ error }) => {
    // Render an error message
    return <div>{error.message}</div>
  },
})
```

The `reset` function can be used to allow the user to retry rendering the error boundaries normal children:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  errorComponent: ({ error, reset }) => {
    return (
      <div>
        {error.message}
        <button
          onClick={() => {
            // Reset the router error boundary
            reset()
          }}
        >
          retry
        </button>
      </div>
    )
  },
})
```

If the error was the result of a route load, you should instead call `router.invalidate()`, which will coordinate both a router reload and an error boundary reset:

```tsx
// routes/posts.tsx
export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  errorComponent: ({ error, reset }) => {
    const router = useRouter()

    return (
      <div>
        {error.message}
        <button
          onClick={() => {
            // Invalidate the route to reload the loader, which will also reset the error boundary
            router.invalidate()
          }}
        >
          retry
        </button>
      </div>
    )
  },
})
```

### Using the default `ErrorComponent`

TanStack Router provides a default `ErrorComponent` that is rendered when an error occurs during the route loading or rendering lifecycle. If you choose to override your routes' error components, it's still wise to always fall back to rendering any uncaught errors with the default `ErrorComponent`:

```tsx
// routes/posts.tsx
import { createFileRoute, ErrorComponent } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  loader: () => fetchPosts(),
  errorComponent: ({ error }) => {
    if (error instanceof MyCustomError) {
      // Render a custom error message
      return <div>{error.message}</div>
    }

    // Fallback to the default ErrorComponent
    return <ErrorComponent error={error} />
  },
})
```

# Data Mutations

Since TanStack router does not store or cache data, it's role in data mutation is slim to none outside of reacting to potential URL side-effects from external mutation events. That said, we've compiled a list of mutation-related features you might find useful and libraries that implement them.

Look for and use mutation utilities that support:

- Handling and caching submission state
- Providing both local and global optimistic UI support
- Built-in hooks to wire up invalidation (or automatically support it)
- Handling multiple in-flight mutations at once
- Organizing mutation state as a globally accessible resource
- Submission state history and garbage collection

Some suggested libraries:

- [TanStack Query](https://tanstack.com/query/latest/docs/react/guides/mutations)
- [SWR](https://swr.vercel.app/)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [urql](https://formidable.com/open-source/urql/)
- [Relay](https://relay.dev/)
- [Apollo](https://www.apollographql.com/docs/react/)

Or, even...

- [Zustand](https://zustand-demo.pmnd.rs/)
- [Jotai](https://jotai.org/)
- [Recoil](https://recoiljs.org/)
- [Redux](https://redux.js.org/)

Similar to data fetching, mutation state isn't a one-size-fits-all solution, so you'll need to pick a solution that fits your needs and your team's needs. We recommend trying out a few different solutions and seeing what works best for you.

> ⚠️ Still here? Submission state is an interesting topic when it comes to persistence. Do you keep every mutation around forever? How do you know when to get rid of it? What if the user navigates away from the screen and then back? Let's dig in!

## Invalidating TanStack Router after a mutation

TanStack Router comes with short-term caching built-in. So even though we're not storing any data after a route match is unmounted, there is a high probability that if any mutations are made related to the data stored in the Router, the current route matches' data could become stale.

When mutations related to loader data are made, we can use `router.invalidate` to force the router to reload all of the current route matches:

```tsx
const router = useRouter()

const addTodo = async (todo: Todo) => {
  try {
    await api.addTodo()
    router.invalidate()
  } catch {
    //
  }
}
```

Invalidating all of the current route matches happens in the background, so existing data will continue to be served until the new data is ready, just as if you were navigating to a new route.

If you want to await the invalidation until all loaders have finished, pass `{sync: true}` into `router.invalidate`:

```tsx
const router = useRouter()

const addTodo = async (todo: Todo) => {
  try {
    await api.addTodo()
    await router.invalidate({ sync: true })
  } catch {
    //
  }
}
```

## Long-term mutation State

Regardless of the mutation library used, mutations often create state related to their submission. While most mutations are set-and-forget, some mutation states are more long-lived, either to support optimistic UI or to provide feedback to the user about the status of their submissions. Most state managers will correctly keep this submission state around and expose it to make it possible to show UI elements like loading spinners, success messages, error messages, etc.

Let's consider the following interactions:

- User navigates to the `/posts/123/edit` screen to edit a post
- User edits the `123` post and upon success, sees a success message below the editor that the post was updated
- User navigates to the `/posts` screen
- User navigates back to the `/posts/123/edit` screen again

Without notifying your mutation management library about the route change, it's possible that your submission state could still be around and your user would still see the **"Post updated successfully"** message when they return to the previous screen. This is not ideal. Obviously, our intent wasn't to keep this mutation state around forever, right?!

## Using mutation keys

Hopefully and hypothetically, the easiest way is for your mutation library to support a keying mechanism that will allow your mutations's state to be reset when the key changes:

```tsx
const routeApi = getRouteApi('/posts/$postId/edit')

function EditPost() {
  const { roomId } = routeApi.useParams()

  const sendMessageMutation = useCoolMutation({
    fn: sendMessage,
    // Clear the mutation state when the roomId changes
    // including any submission state
    key: ['sendMessage', roomId],
  })

  // Fire off a bunch of messages
  const test = () => {
    sendMessageMutation.mutate({ roomId, message: 'Hello!' })
    sendMessageMutation.mutate({ roomId, message: 'How are you?' })
    sendMessageMutation.mutate({ roomId, message: 'Goodbye!' })
  }

  return (
    <>
      {sendMessageMutation.submissions.map((submission) => {
        return (
          <div>
            <div>{submission.status}</div>
            <div>{submission.message}</div>
          </div>
        )
      })}
    </>
  )
}
```

## Using the `router.subscribe` method

For libraries that don't have a keying mechanism, we'll likely need to manually reset the mutation state when the user navigates away from the screen. To solve this, we can use TanStack Router's `invalidate` and `subscribe` method to clear mutation states when the user is no longer in need of them.

The `router.subscribe` method is a function that subscribes a callback to various router events. The event in particular that we'll use here is the `onResolved` event. It's important to understand that this event is fired when the location path is _changed (not just reloaded) and has finally resolved_.

This is a great place to reset your old mutation states. Here's an example:

```tsx
const router = createRouter()
const coolMutationCache = createCoolMutationCache()

const unsubscribeFn = router.subscribe('onResolved', () => {
  // Reset mutation states when the route changes
  coolMutationCache.clear()
})
```

# Deferred Data Loading

TanStack Router is designed to run loaders in parallel and wait for all of them to resolve before rendering the next route. This is great most of the time, but occasionally, you may want to show the user something sooner while the rest of the data loads in the background.

Deferred data loading is a pattern that allows the router to render the next location's critical data/markup while slower, non-critical route data is resolved in the background. This process works on both the client and server (via streaming) and is a great way to improve the perceived performance of your application.

If you are using a library like [TanStack Query](https://react-query.tanstack.com) or any other data fetching library, then deferred data loading works a bit differently. Skip ahead to the [Deferred Data Loading with External Libraries](#deferred-data-loading-with-external-libraries) section for more information.

## Deferred Data Loading with `Await`

To defer slow or non-critical data, return an **unawaited/unresolved** promise anywhere in your loader response:

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute, defer } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async () => {
    // Fetch some slower data, but do not await it
    const slowDataPromise = fetchSlowData()

    // Fetch and await some data that resolves quickly
    const fastData = await fetchFastData()

    return {
      fastData,
      deferredSlowData: slowDataPromise,
    }
  },
})
```

As soon as any awaited promises are resolved, the next route will begin rendering while the deferred promises continue to resolve.

In the component, deferred promises can be resolved and utilized using the `Await` component:

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute, Await } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  // ...
  component: PostIdComponent,
})

function PostIdComponent() {
  const { deferredSlowData, fastData } = Route.useLoaderData()

  // do something with fastData

  return (
    <Await promise={deferredSlowData} fallback={<div>Loading...</div>}>
      {(data) => {
        return <div>{data}</div>
      }}
    </Await>
  )
}
```

> [!TIP]
> If your component is code-split, you can use the [getRouteApi function](../code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useLoaderData()` hook.

The `Await` component resolves the promise by triggering the nearest suspense boundary until it is resolved, after which it renders the component's `children` as a function with the resolved data.

If the promise is rejected, the `Await` component will throw the serialized error, which can be caught by the nearest error boundary.

[//]: # 'DeferredWithAwaitFinalTip'

> [!TIP]
> In React 19, you can use the `use()` hook instead of `Await`

[//]: # 'DeferredWithAwaitFinalTip'

## Deferred Data Loading with External libraries

When your strategy for fetching information for the route relies on [External Data Loading](../external-data-loading.md) with an external library like [TanStack Query](https://tanstack.com/query), deferred data loading works a bit differently, as the library handles the data fetching and caching for you outside of TanStack Router.

So, instead of using `defer` and `Await`, you'll instead want to use the Route's `loader` to kick off the data fetching and then use the library's hooks to access the data in your components.

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { slowDataOptions, fastDataOptions } from '~/api/query-options'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context: { queryClient } }) => {
    // Kick off the fetching of some slower data, but do not await it
    queryClient.prefetchQuery(slowDataOptions())

    // Fetch and await some data that resolves quickly
    await queryClient.ensureQueryData(fastDataOptions())
  },
})
```

Then in your component, you can use the library's hooks to access the data:

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'
import { useSuspenseQuery } from '@tanstack/react-query'
import { slowDataOptions, fastDataOptions } from '~/api/query-options'

export const Route = createFileRoute('/posts/$postId')({
  // ...
  component: PostIdComponent,
})

function PostIdComponent() {
  const fastData = useSuspenseQuery(fastDataOptions())

  // do something with fastData

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <SlowDataComponent />
    </Suspense>
  )
}

function SlowDataComponent() {
  const data = useSuspenseQuery(slowDataOptions())

  return <div>{data}</div>
}
```

## Caching and Invalidation

Streamed promises follow the same lifecycle as the loader data they are associated with. They can even be preloaded!

[//]: # 'SSRContent'

## SSR & Streaming Deferred Data

**Streaming requires a server that supports it and for TanStack Router to be configured to use it properly.**

Please read the entire [Streaming SSR Guide](../ssr.md#streaming-ssr) for step by step instructions on how to set up your server for streaming.

## SSR Streaming Lifecycle

The following is a high-level overview of how deferred data streaming works with TanStack Router:

- Server
  - Promises are marked and tracked as they are returned from route loaders
  - All loaders resolve and any deferred promises are serialized and embedded into the html
  - The route begins to render
  - Deferred promises rendered with the `<Await>` component trigger suspense boundaries, allowing the server to stream html up to that point
- Client
  - The client receives the initial html from the server
  - `<Await>` components suspend with placeholder promises while they wait for their data to resolve on the server
- Server
  - As deferred promises resolve, their results (or errors) are serialized and streamed to the client via an inline script tag
  - The resolved `<Await>` components and their suspense boundaries are resolved and their resulting HTML is streamed to the client along with their dehydrated data
- Client
  - The suspended placeholder promises within `<Await>` are resolved with the streamed data/error responses and either render the result or throw the error to the nearest error boundary

[//]: # 'SSRContent'

# Document Head Management

Document head management is the process of managing the head, title, meta, link, and script tags of a document and TanStack Router provides a robust way to manage the document head for full-stack applications that use Start and for single-page applications that use `@tanstack/react-router`. It provides:

- Automatic deduping of `title` and `meta` tags
- Automatic loading/unloading of tags based on route visibility
- A composable way to merge `title` and `meta` tags from nested routes

For full-stack applications that use Start, and even for single-page applications that use `@tanstack/react-router`, managing the document head is a crucial part of any application for the following reasons:

- SEO
- Social media sharing
- Analytics
- CSS and JS loading/unloading

To manage the document head, it's required that you render both the `<HeadContent />` and `<Scripts />` components and use the `routeOptions.head` property to manage the head of a route, which returns an object with `title`, `meta`, `links`, and `scripts` properties.

## Managing the Document Head

```tsx
export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        name: 'description',
        content: 'My App is a web application',
      },
      {
        title: 'My App',
      },
    ],
    links: [
      {
        rel: 'icon',
        href: '/favicon.ico',
      },
    ],
    scripts: [
      {
        src: 'https://www.google-analytics.com/analytics.js',
      },
    ],
  }),
})
```

### Deduping

Out of the box, TanStack Router will dedupe `title` and `meta` tags, preferring the **last** occurrence of each tag found in nested routes.

- `title` tags defined in nested routes will override a `title` tag defined in a parent route (but you can compose them together, which is covered in a future section of this guide)
- `meta` tags with the same `name` or `property` will be overridden by the last occurrence of that tag found in nested routes

### `<HeadContent />`

The `<HeadContent />` component is **required** to render the head, title, meta, link, and head-related script tags of a document.

It should be **rendered either in the `<head>` tag of your root layout or as high up in the component tree as possible** if your application doesn't or can't manage the `<head>` tag.

### Start/Full-Stack Applications

```tsx
import { HeadContent } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
      </body>
    </html>
  ),
})
```

### Single-Page Applications

```tsx
import { HeadContent } from '@tanstack/react-router'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <HeadContent />
      <Outlet />
    </>
  ),
})
```

## Managing Body Scripts

In addition to scripts that can be rendered in the `<head>` tag, you can also render scripts in the `<body>` tag using the `routeOptions.scripts` property. This is useful for loading scripts (even inline scripts) that require the DOM to be loaded, but before the main entry point of your application (which includes hydration if you're using Start or a full-stack implementation of TanStack Router).

To do this, you must:

- Use the `scripts` property of the `routeOptions` object
- [Render the `<Scripts />` component](#scripts)

```tsx
export const Route = createRootRoute({
  scripts: [
    {
      children: 'console.log("Hello, world!")',
    },
  ],
})
```

### `<Scripts />`

The `<Scripts />` component is **required** to render the body scripts of a document. It should be rendered either in the `<body>` tag of your root layout or as high up in the component tree as possible if your application doesn't or can't manage the `<body>` tag.

### Example

```tsx
import { createFileRoute, Scripts } from '@tanstack/react-router'
export const Router = createFileRoute('/')({
  component: () => (
    <html>
      <head />
      <body>
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
})
```

```tsx
import { Scripts, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Scripts />
    </>
  ),
})
```

# External Data Loading

> [!IMPORTANT]
> This guide is geared towards external state management libraries and their integration with TanStack Router for data fetching, ssr, hydration/dehydration and streaming. If you haven't read the standard [Data Loading](../data-loading.md) guide, please do so first.

## To **Store** or to **Coordinate**?

While Router is very capable of storing and managing most data needs out of the box, sometimes you just might want something more robust!

Router is designed to be a perfect **coordinator** for external data fetching and caching libraries. This means that you can use any data fetching/caching library you want, and the router will coordinate the loading of your data in a way that aligns with your users' navigation and expectations of freshness.

## What data fetching libraries are supported?

Any data fetching library that supports asynchronous promises can be used with TanStack Router. This includes:

- [TanStack Query](https://tanstack.com/query/latest/docs/react/overview)
- [SWR](https://swr.vercel.app/)
- [RTK Query](https://redux-toolkit.js.org/rtk-query/overview)
- [urql](https://formidable.com/open-source/urql/)
- [Relay](https://relay.dev/)
- [Apollo](https://www.apollographql.com/docs/react/)

Or, even...

- [Zustand](https://zustand-demo.pmnd.rs/)
- [Jotai](https://jotai.org/)
- [Recoil](https://recoiljs.org/)
- [Redux](https://redux.js.org/)

Literally any library that **can return a promise and read/write data** can be integrated.

## Using Loaders to ensure data is loaded

The easiest way to use integrate and external caching/data library into Router is to use `route.loader`s to ensure that the data required inside of a route has been loaded and is ready to be displayed.

> ⚠️ BUT WHY? It's very important to preload your critical render data in the loader for a few reasons:
>
> - No "flash of loading" states
> - No waterfall data fetching, caused by component based fetching
> - Better for SEO. If your data is available at render time, it will be indexed by search engines.

Here is a naive illustration (don't do this) of using a Route's `loader` option to seed the cache for some data:

```tsx
// src/routes/posts.tsx
let postsCache = []

export const Route = createFileRoute('/posts')({
  loader: async () => {
    postsCache = await fetchPosts()
  },
  component: () => {
    return (
      <div>
        {postsCache.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
    )
  },
})
```

This example is **obviously flawed**, but illustrates the point that you can use a route's `loader` option to seed your cache with data. Let's take a look at a more realistic example using TanStack Query.

- Replace `fetchPosts` with your preferred data fetching library's prefetching API
- Replace `postsCache` with your preferred data fetching library's read-or-fetch API or hook

## A more realistic example using TanStack Query

Let's take a look at a more realistic example using TanStack Query.

```tsx
// src/routes/posts.tsx
const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: () => fetchPosts(),
})

export const Route = createFileRoute('/posts')({
  // Use the `loader` option to ensure that the data is loaded
  loader: () => queryClient.ensureQueryData(postsQueryOptions),
  component: () => {
    // Read the data from the cache and subscribe to updates
    const {
      data: { posts },
    } = useSuspenseQuery(postsQueryOptions)

    return (
      <div>
        {posts.map((post) => (
          <Post key={post.id} post={post} />
        ))}
      </div>
    )
  },
})
```

### Error handling with TanStack Query

When an error occurs while using `suspense` with `Tanstack Query`, you'll need to let queries know that you want to try again when re-rendering. This can be done by using the `reset` function provided by the `useQueryErrorResetBoundary` hook. We can invoke this function in an effect as soon as the error component mounts. This will make sure that the query is reset and will try to fetch data again when the route component is rendered again. This will also cover cases where users navigate away from our route instead of clicking the `retry` button.

```tsx
export const Route = createFileRoute('/posts')({
  loader: () => queryClient.ensureQueryData(postsQueryOptions),
  errorComponent: ({ error, reset }) => {
    const router = useRouter()
    const queryErrorResetBoundary = useQueryErrorResetBoundary()

    useEffect(() => {
      // Reset the query error boundary
      queryErrorResetBoundary.reset()
    }, [queryErrorResetBoundary])

    return (
      <div>
        {error.message}
        <button
          onClick={() => {
            // Invalidate the route to reload the loader, and reset any router error boundaries
            router.invalidate()
          }}
        >
          retry
        </button>
      </div>
    )
  },
})
```

## SSR Dehydration/Hydration

Tools that are able can integrate with TanStack Router's convenient Dehydration/Hydration APIs to shuttle dehydrated data between the server and client and rehydrate it where needed. Let's go over how to do this with both 3rd party critical data and 3rd party deferred data.

## Critical Dehydration/Hydration

**For critical data needed for the first render/paint**, TanStack Router supports **`dehydrate` and `hydrate`** options when configuring the `Router`. These callbacks are functions that are automatically called on the server and client when the router dehydrates and hydrates normally and allow you to augment the dehydrated data with your own data.

The `dehydrate` function can return any serializable JSON data which will get merged and injected into the dehydrated payload that is sent to the client. This payload is delivered via the `DehydrateRouter` component which, when rendered, provides the data back to you in the `hydrate` function on the client.

For example, let's dehydrate and hydrate a TanStack Query `QueryClient` so that our data we fetched on the server will be available for hydration on the client.

```tsx
// src/router.tsx

export function createRouter() {
  // Make sure you create your loader client or similar data
  // stores inside of your `createRouter` function. This ensures
  // that your data stores are unique to each request and
  // always present on both server and client.
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    // Optionally provide your loaderClient to the router context for
    // convenience (you can provide anything you want to the router
    // context!)
    context: {
      queryClient,
    },
    // On the server, dehydrate the loader client so the router
    // can serialize it and send it to the client for us
    dehydrate: () => {
      return {
        queryClientState: dehydrate(queryClient),
      }
    },
    // On the client, hydrate the loader client with the data
    // we dehydrated on the server
    hydrate: (dehydrated) => {
      hydrate(queryClient, dehydrated.queryClientState)
    },
    // Optionally, we can use `Wrap` to wrap our router in the loader client provider
    Wrap: ({ children }) => {
      return (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      )
    },
  })
}
```

# History Types

While it's not required to know the `@tanstack/history` API itself to use TanStack Router, it's a good idea to understand how it works. Under the hood, TanStack Router requires and uses a `history` abstraction to manage the routing history.

If you don't create a history instance, a browser-oriented instance of this API is created for you when the router is initialized. If you need a special history API type, You can use the `@tanstack/history` package to create your own:

- `createBrowserHistory`: The default history type.
- `createHashHistory`: A history type that uses a hash to track history.
- `createMemoryHistory`: A history type that keeps the history in memory.

Once you have a history instance, you can pass it to the `Router` constructor:

```ts
import { createMemoryHistory, createRouter } from '@tanstack/react-router'

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'], // Pass your initial url
})

const router = createRouter({ routeTree, history: memoryHistory })
```

## Browser Routing

The `createBrowserHistory` is the default history type. It uses the browser's history API to manage the browser history.

## Hash Routing

Hash routing can be helpful if your server doesn't support rewrites to index.html for HTTP requests (among other environments that don't have a server).

```ts
import { createHashHistory, createRouter } from '@tanstack/react-router'

const hashHistory = createHashHistory()

const router = createRouter({ routeTree, history: hashHistory })
```

## Memory Routing

Memory routing is useful in environments that are not a browser or when you do not want components to interact with the URL.

```ts
import { createMemoryHistory, createRouter } from '@tanstack/react-router'

const memoryHistory = createMemoryHistory({
  initialEntries: ['/'], // Pass your initial url
})

const router = createRouter({ routeTree, history: memoryHistory })
```

Refer to the [SSR Guide](../ssr.md#server-history) for usage on the server for server-side rendering.

# Link Options

You may want to reuse options that are intended to be passed to `Link`, `redirect` or `navigate`. In which case you may decide an object literal is a good way to represent options passed to `Link`.

```tsx
const dashboardLinkOptions = {
  to: '/dashboard',
  search: { search: '' },
}

function DashboardComponent() {
  return <Link {...dashboardLinkOptions} />
}
```

There are a few problems here. `dashboardLinkOptions.to` is inferred as `string` which by default will resolve to every route when passed to `Link`, `navigate` or `redirect` (this particular issue could be fixed by `as const`). The other issue here is we do not know `dashboardLinkOptions` even passes the type checker until it is spread into `Link`. We could very easily create incorrect navigation options and only when the options are spread into `Link` do we know there is a type error.

### Using `linkOptions` function to create re-usable options

`linkOptions` is a function which type checks an object literal and returns the inferred input as is. This provides type safety on options exactly like `Link` before it is used allowing for easier maintenance and re-usability. Our above example using `linkOptions` looks like this:

```tsx
const dashboardLinkOptions = linkOptions({
  to: '/dashboard',
  search: { search: '' },
})

function DashboardComponent() {
  return <Link {...dashboardLinkOptions} />
}
```

This allows eager type checking of `dashboardLinkOptions` which can then be re-used anywhere

```tsx
const dashboardLinkOptions = linkOptions({
  to: '/dashboard',
  search: { search: '' },
})

export const Route = createFileRoute('/dashboard')({
  component: DashboardComponent,
  validateSearch: (input) => ({ search: input.search }),
  beforeLoad: () => {
    // can used in redirect
    throw redirect(dashboardLinkOptions)
  },
})

function DashboardComponent() {
  const navigate = useNavigate()

  return (
    <div>
      {/** can be used in navigate */}
      <button onClick={() => navigate(dashboardLinkOptions)} />

      {/** can be used in Link */}
      <Link {...dashboardLinkOptions} />
    </div>
  )
}
```

### An array of `linkOptions`

When creating navigation you might loop over an array to construct a navigation bar. In which case `linkOptions` can be used to type check an array of object literals which are intended for `Link` props

```tsx
const options = linkOptions([
  {
    to: '/dashboard',
    label: 'Summary',
    activeOptions: { exact: true },
  },
  {
    to: '/dashboard/invoices',
    label: 'Invoices',
  },
  {
    to: '/dashboard/users',
    label: 'Users',
  },
])

function DashboardComponent() {
  return (
    <>
      <div className="flex items-center border-b">
        <h2 className="text-xl p-2">Dashboard</h2>
      </div>

      <div className="flex flex-wrap divide-x">
        {options.map((option) => {
          return (
            <Link
              {...option}
              key={option.to}
              activeProps={{ className: `font-bold` }}
              className="p-2"
            >
              {option.label}
            </Link>
          )
        })}
      </div>
      <hr />

      <Outlet />
    </>
  )
}
```

The input of `linkOptions` is inferred and returned, as shown with the use of `label` as this does not exist on `Link` props

# Navigation Blocking

Navigation blocking is a way to prevent navigation from happening. This is typical if a user attempts to navigate while they:

- Have unsaved changes
- Are in the middle of a form
- Are in the middle of a payment

In these situations, a prompt or custom UI should be shown to the user to confirm they want to navigate away.

- If the user confirms, navigation will continue as normal
- If the user cancels, all pending navigations will be blocked

## How does navigation blocking work?

Navigation blocking adds one or more layers of "blockers" to the entire underlying history API. If any blockers are present, navigation will be paused via one of the following ways:

- Custom UI
  - If the navigation is triggered by something we control at the router level, we can allow you to perform any task or show any UI you'd like to the user to confirm the action. Each blocker's `blocker` function will be asynchronously and sequentially executed. If any blocker function resolves or returns `true`, the navigation will be allowed and all other blockers will continue to do the same until all blockers have been allowed to proceed. If any single blocker resolves or returns `false`, the navigation will be canceled and the rest of the `blocker` functions will be ignored.
- The `onbeforeunload` event
  - For page events that we cannot control directly, we rely on the browser's `onbeforeunload` event. If the user attempts to close the tab or window, refresh, or "unload" the page assets in any way, the browser's generic "Are you sure you want to leave?" dialog will be shown. If the user confirms, all blockers will be bypassed and the page will unload. If the user cancels, the unload will be cancelled, and the page will remain as is.

## How do I use navigation blocking?

There are 2 ways to use navigation blocking:

- Hook/logical-based blocking
- Component-based blocking

## Hook/logical-based blocking

Let's imagine we want to prevent navigation if a form is dirty. We can do this by using the `useBlocker` hook:

[//]: # 'HookBasedBlockingExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty) return false

      const shouldLeave = confirm('Are you sure you want to leave?')
      return !shouldLeave
    },
  })

  // ...
}
```

[//]: # 'HookBasedBlockingExample'

`shouldBlockFn` gives you type safe access to the `current` and `next` location:

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  // always block going from /foo to /bar/123?hello=world
  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: ({ current, next }) => {
      return (
        current.routeId === '/foo' &&
        next.fullPath === '/bar/$id' &&
        next.params.id === 123 &&
        next.search.hello === 'world'
      )
    },
    withResolver: true,
  })

  // ...
}
```

You can find more information about the `useBlocker` hook in the [API reference](../../api/router/useBlockerHook.md).

## Component-based blocking

In addition to logical/hook based blocking, can use the `Block` component to achieve similar results:

[//]: # 'ComponentBasedBlockingExample'

```tsx
import { Block } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Block
      shouldBlockFn={() => {
        if (!formIsDirty) return false

        const shouldLeave = confirm('Are you sure you want to leave?')
        return !shouldLeave
      }}
    />
  )

  // OR

  return (
    <Block shouldBlockFn={() => !formIsDirty} withResolver>
      {({ status, proceed, reset }) => <>{/* ... */}</>}
    </Block>
  )
}
```

[//]: # 'ComponentBasedBlockingExample'

## How can I show a custom UI?

In most cases, using `window.confirm` in the `shouldBlockFn` function with `withResolver: false` in the hook is enough since it will clearly show the user that the navigation is being blocked and resolve the blocking based on their response.

However, in some situations, you might want to show a custom UI that is intentionally less disruptive and more integrated with your app's design.

**Note:** The return value of `shouldBlockFn` does not resolve the blocking if `withResolver` is `true`.

### Hook/logical-based custom UI with resolver

[//]: # 'HookBasedCustomUIBlockingWithResolverExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  const { proceed, reset, status } = useBlocker({
    shouldBlockFn: () => formIsDirty,
    withResolver: true,
  })

  // ...

  return (
    <>
      {/* ... */}
      {status === 'blocked' && (
        <div>
          <p>Are you sure you want to leave?</p>
          <button onClick={proceed}>Yes</button>
          <button onClick={reset}>No</button>
        </div>
      )}
    </>
}
```

[//]: # 'HookBasedCustomUIBlockingWithResolverExample'

### Hook/logical-based custom UI without resolver

[//]: # 'HookBasedCustomUIBlockingWithoutResolverExample'

```tsx
import { useBlocker } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  useBlocker({
    shouldBlockFn: () => {
      if (!formIsDirty) {
        return false
      }

      const shouldBlock = new Promise<boolean>((resolve) => {
        // Using a modal manager of your choice
        modals.open({
          title: 'Are you sure you want to leave?',
          children: (
            <SaveBlocker
              confirm={() => {
                modals.closeAll()
                resolve(false)
              }}
              reject={() => {
                modals.closeAll()
                resolve(true)
              }}
            />
          ),
          onClose: () => resolve(true),
        })
      })
      return shouldBlock
    },
  })

  // ...
}
```

[//]: # 'HookBasedCustomUIBlockingWithoutResolverExample'

### Component-based custom UI

Similarly to the hook, the `Block` component returns the same state and functions as render props:

[//]: # 'ComponentBasedCustomUIBlockingExample'

```tsx
import { Block } from '@tanstack/react-router'

function MyComponent() {
  const [formIsDirty, setFormIsDirty] = useState(false)

  return (
    <Block shouldBlockFn={() => formIsDirty} withResolver>
      {({ status, proceed, reset }) => (
        <>
          {/* ... */}
          {status === 'blocked' && (
            <div>
              <p>Are you sure you want to leave?</p>
              <button onClick={proceed}>Yes</button>
              <button onClick={reset}>No</button>
            </div>
          )}
        </>
      )}
    </Block>
  )
}
```

[//]: # 'ComponentBasedCustomUIBlockingExample'

# Navigation

## Everything is Relative

Believe it or not, every navigation within an app is **relative**, even if you aren't using explicit relative path syntax (`../../somewhere`). Any time a link is clicked or an imperative navigation call is made, you will always have an **origin** path and a **destination** path which means you are navigating **from** one route **to** another route.

TanStack Router keeps this constant concept of relative navigation in mind for every navigation, so you'll constantly see two properties in the API:

- `from` - The origin route path
- `to` - The destination route path

> ⚠️ If a `from` route path isn't provided the router will assume you are navigating from the root `/` route and only auto-complete absolute paths. After all, you need to know where you are from in order to know where you're going 😉.

## Shared Navigation API

Every navigation and route matching API in TanStack Router uses the same core interface with minor differences depending on the API. This means that you can learn navigation and route matching once and use the same syntax and concepts across the library.

### `ToOptions` Interface

This is the core `ToOptions` interface that is used in every navigation and route matching API:

```ts
type ToOptions<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
> = {
  // `from` is an optional route ID or path. If it is not supplied, only absolute paths will be auto-completed and type-safe. It's common to supply the route.fullPath of the origin route you are rendering from for convenience. If you don't know the origin route, leave this empty and work with absolute paths or unsafe relative paths.
  from: string
  // `to` can be an absolute route path or a relative path from the `from` option to a valid route path. ⚠️ Do not interpolate path params, hash or search params into the `to` options. Use the `params`, `search`, and `hash` options instead.
  to: string
  // `params` is either an object of path params to interpolate into the `to` option or a function that supplies the previous params and allows you to return new ones. This is the only way to interpolate dynamic parameters into the final URL. Depending on the `from` and `to` route, you may need to supply none, some or all of the path params. TypeScript will notify you of the required params if there are any.
  params:
    | Record<string, unknown>
    | ((prevParams: Record<string, unknown>) => Record<string, unknown>)
  // `search` is either an object of query params or a function that supplies the previous search and allows you to return new ones. Depending on the `from` and `to` route, you may need to supply none, some or all of the query params. TypeScript will notify you of the required search params if there are any.
  search:
    | Record<string, unknown>
    | ((prevSearch: Record<string, unknown>) => Record<string, unknown>)
  // `hash` is either a string or a function that supplies the previous hash and allows you to return a new one.
  hash?: string | ((prevHash: string) => string)
  // `state` is either an object of state or a function that supplies the previous state and allows you to return a new one. State is stored in the history API and can be useful for passing data between routes that you do not want to permanently store in URL search params.
  state?:
    | Record<string, any>
    | ((prevState: Record<string, unknown>) => Record<string, unknown>)
}
```

> 🧠 Every route object has a `to` property, which can be used as the `to` for any navigation or route matching API. Where possible, this will allow you to avoid plain strings and use type-safe route references instead:

```tsx
import { Route as aboutRoute } from './routes/about.tsx'

function Comp() {
  return <Link to={aboutRoute.to}>About</Link>
}
```

### `NavigateOptions` Interface

This is the core `NavigateOptions` interface that extends `ToOptions`. Any API that is actually performing a navigation will use this interface:

```ts
export type NavigateOptions<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
> = ToOptions<TRouteTree, TFrom, TTo> & {
  // `replace` is a boolean that determines whether the navigation should replace the current history entry or push a new one.
  replace?: boolean
  // `resetScroll` is a boolean that determines whether scroll position will be reset to 0,0 after the location is committed to browser history.
  resetScroll?: boolean
  // `hashScrollIntoView` is a boolean or object that determines whether an id matching the hash will be scrolled into view after the location is committed to history.
  hashScrollIntoView?: boolean | ScrollIntoViewOptions
  // `viewTransition` is either a boolean or function that determines if and how the browser will call document.startViewTransition() when navigating.
  viewTransition?: boolean | ViewTransitionOptions
  // `ignoreBlocker` is a boolean that determines if navigation should ignore any blockers that might prevent it.
  ignoreBlocker?: boolean
  // `reloadDocument` is a boolean that determines if navigation to a route inside of router will trigger a full page load instead of the traditional SPA navigation.
  reloadDocument?: boolean
  // `href` is a string that can be used in place of `to` to navigate to a full built href, e.g. pointing to an external target.
  href?: string
}
```

### `LinkOptions` Interface

Anywhere an actual `<a>` tag the `LinkOptions` interface which extends `NavigateOptions` will be available:

```tsx
export type LinkOptions<
  TRouteTree extends AnyRoute = AnyRoute,
  TFrom extends RoutePaths<TRouteTree> | string = string,
  TTo extends string = '',
> = NavigateOptions<TRouteTree, TFrom, TTo> & {
  // The standard anchor tag target attribute
  target?: HTMLAnchorElement['target']
  // Defaults to `{ exact: false, includeHash: false }`
  activeOptions?: {
    exact?: boolean
    includeHash?: boolean
    includeSearch?: boolean
    explicitUndefined?: boolean
  }
  // If set, will preload the linked route on hover and cache it for this many milliseconds in hopes that the user will eventually navigate there.
  preload?: false | 'intent'
  // Delay intent preloading by this many milliseconds. If the intent exits before this delay, the preload will be cancelled.
  preloadDelay?: number
  // If true, will render the link without the href attribute
  disabled?: boolean
}
```

## Navigation API

With relative navigation and all of the interfaces in mind now, let's talk about the different flavors of navigation API at your disposal:

- The `<Link>` component
  - Generates an actual `<a>` tag with a valid `href` which can be click or even cmd/ctrl + clicked to open in a new tab
- The `useNavigate()` hook
  - When possible, `Link` component should be used for navigation, but sometimes you need to navigate imperatively as a result of a side-effect. `useNavigate` returns a function that can be called to perform an immediate client-side navigation.
- The `<Navigate>` component
  - Renders nothing and performs an immediate client-side navigation.
- The `Router.navigate()` method
  - This is the most powerful navigation API in TanStack Router. Similar to `useNavigate`, it imperatively navigates, but is available everywhere you have access to your router.

⚠️ None of these APIs are a replacement for server-side redirects. If you need to redirect a user immediately from one route to another before mounting your application, use a server-side redirect instead of a client-side navigation.

## `<Link>` Component

The `Link` component is the most common way to navigate within an app. It renders an actual `<a>` tag with a valid `href` attribute which can be clicked or even cmd/ctrl + clicked to open in a new tab. It also supports any normal `<a>` attributes including `target` to open links in new windows, etc.

In addition to the [`LinkOptions`](#linkoptions-interface) interface, the `Link` component also supports the following props:

```tsx
export type LinkProps<
  TFrom extends RoutePaths<RegisteredRouter['routeTree']> | string = string,
  TTo extends string = '',
> = LinkOptions<RegisteredRouter['routeTree'], TFrom, TTo> & {
  // A function that returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  activeProps?:
    | FrameworkHTMLAnchorTagAttributes
    | (() => FrameworkHTMLAnchorAttributes)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | FrameworkHTMLAnchorAttributes
    | (() => FrameworkHTMLAnchorAttributes)
}
```

### Absolute Links

Let's make a simple static link!

```tsx
import { Link } from '@tanstack/react-router'

const link = <Link to="/about">About</Link>
```

### Dynamic Links

Dynamic links are links that have dynamic segments in them. For example, a link to a blog post might look like this:

```tsx
const link = (
  <Link
    to="/blog/post/$postId"
    params={{
      postId: 'my-first-blog-post',
    }}
  >
    Blog Post
  </Link>
)
```

Keep in mind that normally dynamic segment params are `string` values, but they can also be any other type that you parse them to in your route options. Either way, the type will be checked at compile time to ensure that you are passing the correct type.

### Relative Links

By default, all links are absolute unless a `from` route path is provided. This means that the above link will always navigate to the `/about` route regardless of what route you are currently on.

If you want to make a link that is relative to the current route, you can provide a `from` route path:

```tsx
const postIdRoute = createRoute({
  path: '/blog/post/$postId',
})

const link = (
  <Link from={postIdRoute.fullPath} to="../categories">
    Categories
  </Link>
)
```

As seen above, it's common to provide the `route.fullPath` as the `from` route path. This is because the `route.fullPath` is a reference that will update if you refactor your application. However, sometimes it's not possible to import the route directly, in which case it's fine to provide the route path directly as a string. It will still get type-checked as per usual!

### Search Param Links

Search params are a great way to provide additional context to a route. For example, you might want to provide a search query to a search page:

```tsx
const link = (
  <Link
    to="/search"
    search={{
      query: 'tanstack',
    }}
  >
    Search
  </Link>
)
```

It's also common to want to update a single search param without supplying any other information about the existing route. For example, you might want to update the page number of a search result:

```tsx
const link = (
  <Link
    to="."
    search={(prev) => ({
      ...prev,
      page: prev.page + 1,
    })}
  >
    Next Page
  </Link>
)
```

### Search Param Type Safety

Search params are a highly dynamic state management mechanism, so it's important to ensure that you are passing the correct types to your search params. We'll see in a later section in detail how to validate and ensure search params typesafety, among other great features!

### Hash Links

Hash links are a great way to link to a specific section of a page. For example, you might want to link to a specific section of a blog post:

```tsx
const link = (
  <Link
    to="/blog/post/$postId"
    params={{
      postId: 'my-first-blog-post',
    }}
    hash="section-1"
  >
    Section 1
  </Link>
)
```

### Active & Inactive Props

The `Link` component supports two additional props: `activeProps` and `inactiveProps`. These props are functions that return additional props for the `active` and `inactive` states of the link. All props other than styles and classes passed here will override the original props passed to `Link`. Any styles or classes passed are merged together.

Here's an example:

```tsx
const link = (
  <Link
    to="/blog/post/$postId"
    params={{
      postId: 'my-first-blog-post',
    }}
    activeProps={{
      style: {
        fontWeight: 'bold',
      },
    }}
  >
    Section 1
  </Link>
)
```

### The `data-status` attribute

In addition to the `activeProps` and `inactiveProps` props, the `Link` component also adds a `data-status` attribute to the rendered element when it is in an active state. This attribute will be `active` or `undefined` depending on the current state of the link. This can come in handy if you prefer to use data-attributes to style your links instead of props.

### Active Options

The `Link` component comes with an `activeOptions` property that offers a few options of determining if a link is active or not. The following interface describes those options:

```tsx
export interface ActiveOptions {
  // If true, the link will be active if the current route matches the `to` route path exactly (no children routes)
  // Defaults to `false`
  exact?: boolean
  // If true, the link will only be active if the current URL hash matches the `hash` prop
  // Defaults to `false`
  includeHash?: boolean // Defaults to false
  // If true, the link will only be active if the current URL search params inclusively match the `search` prop
  // Defaults to `true`
  includeSearch?: boolean
  // This modifies the `includeSearch` behavior.
  // If true,  properties in `search` that are explicitly `undefined` must NOT be present in the current URL search params for the link to be active.
  // defaults to `false`
  explicitUndefined?: boolean
}
```

By default, it will check if the resulting **pathname** is a prefix of the current route. If any search params are provided, it will check that they _inclusively_ match those in the current location. Hashes are not checked by default.

For example, if you are on the `/blog/post/my-first-blog-post` route, the following links will be active:

```tsx
const link1 = (
  <Link to="/blog/post/$postId" params={{ postId: 'my-first-blog-post' }}>
    Blog Post
  </Link>
)
const link2 = <Link to="/blog/post">Blog Post</Link>
const link3 = <Link to="/blog">Blog Post</Link>
```

However, the following links will not be active:

```tsx
const link4 = (
  <Link to="/blog/post/$postId" params={{ postId: 'my-second-blog-post' }}>
    Blog Post
  </Link>
)
```

It's common for some links to only be active if they are an exact match. A good example of this would be a link to the home page. In scenarios like these, you can pass the `exact: true` option:

```tsx
const link = (
  <Link to="/" activeOptions={{ exact: true }}>
    Home
  </Link>
)
```

This will ensure that the link is not active when you are a child route.

A few more options to be aware of:

- If you want to include the hash in your matching, you can pass the `includeHash: true` option
- If you do **not** want to include the search params in your matching, you can pass the `includeSearch: false` option

### Passing `isActive` to children

The `Link` component accepts a function for its children, allowing you to propagate its `isActive` property to children. For example, you could style a child component based on whether the parent link is active:

```tsx
const link = (
  <Link to="/blog/post">
    {({ isActive }) => {
      return (
        <>
          <span>My Blog Post</span>
          <icon className={isActive ? 'active' : 'inactive'} />
        </>
      )
    }}
  </Link>
)
```

### Link Preloading

The `Link` component supports automatically preloading routes on intent (hovering or touchstart for now). This can be configured as a default in the router options (which we'll talk more about soon) or by passing a `preload='intent'` prop to the `Link` component. Here's an example:

```tsx
const link = (
  <Link to="/blog/post/$postId" preload="intent">
    Blog Post
  </Link>
)
```

With preloading enabled and relatively quick asynchronous route dependencies (if any), this simple trick can increase the perceived performance of your application with very little effort.

What's even better is that by using a cache-first library like `@tanstack/query`, preloaded routes will stick around and be ready for a stale-while-revalidate experience if the user decides to navigate to the route later on.

### Link Preloading Timeout

Along with preloading is a configurable timeout which determines how long a user must hover over a link to trigger the intent-based preloading. The default timeout is 50 milliseconds, but you can change this by passing a `preloadTimeout` prop to the `Link` component with the number of milliseconds you'd like to wait:

```tsx
const link = (
  <Link to="/blog/post/$postId" preload="intent" preloadTimeout={100}>
    Blog Post
  </Link>
)
```

## `useNavigate`

> ⚠️ Because of the `Link` component's built-in affordances around `href`, cmd/ctrl + click-ability, and active/inactive capabilities, it's recommended to use the `Link` component instead of `useNavigate` for anything the user can interact with (e.g. links, buttons). However, there are some cases where `useNavigate` is necessary to handle side-effect navigations (e.g. a successful async action that results in a navigation).

The `useNavigate` hook returns a `navigate` function that can be called to imperatively navigate. It's a great way to navigate to a route from a side-effect (e.g. a successful async action). Here's an example:

```tsx
function Component() {
  const navigate = useNavigate({ from: '/posts/$postId' })

  const handleSubmit = async (e: FrameworkFormEvent) => {
    e.preventDefault()

    const response = await fetch('/posts', {
      method: 'POST',
      body: JSON.stringify({ title: 'My First Post' }),
    })

    const { id: postId } = await response.json()

    if (response.ok) {
      navigate({ to: '/posts/$postId', params: { postId } })
    }
  }
}
```

> 🧠 As shown above, you can pass the `from` option to specify the route to navigate from in the hook call. While this is also possible to pass in the resulting `navigate` function each time you call it, it's recommended to pass it here to reduce on potential error and also not type as much!

### `navigate` Options

The `navigate` function returned by `useNavigate` accepts the [`NavigateOptions` interface](#navigateoptions-interface)

## `Navigate` Component

Occasionally, you may find yourself needing to navigate immediately when a component mounts. Your first instinct might be to reach for `useNavigate` and an immediate side-effect (e.g. useEffect), but this is unnecessary. Instead, you can render the `Navigate` component to achieve the same result:

```tsx
function Component() {
  return <Navigate to="/posts/$postId" params={{ postId: 'my-first-post' }} />
}
```

Think of the `Navigate` component as a way to navigate to a route immediately when a component mounts. It's a great way to handle client-only redirects. It is _definitely not_ a substitute for handling server-aware redirects responsibly on the server.

## `router.navigate`

The `router.navigate` method is the same as the `navigate` function returned by `useNavigate` and accepts the same [`NavigateOptions` interface](#navigateoptions-interface). Unlike the `useNavigate` hook, it is available anywhere your `router` instance is available and is thus a great way to navigate imperatively from anywhere in your application, including outside of your framework.

## `useMatchRoute` and `<MatchRoute>`

The `useMatchRoute` hook and `<MatchRoute>` component are the same thing, but the hook is a bit more flexible. They both accept the standard navigation `ToOptions` interface either as options or props and return `true/false` if that route is currently matched. It also has a handy `pending` option that will return `true` if the route is currently pending (e.g. a route is currently transitioning to that route). This can be extremely useful for showing optimistic UI around where a user is navigating:

```tsx
function Component() {
  return (
    <div>
      <Link to="/users">
        Users
        <MatchRoute to="/users" pending>
          <Spinner />
        </MatchRoute>
      </Link>
    </div>
  )
}
```

The component version `<MatchRoute>` can also be used with a function as children to render something when the route is matched:

```tsx
function Component() {
  return (
    <div>
      <Link to="/users">
        Users
        <MatchRoute to="/users" pending>
          {(match) => {
            return <Spinner show={match} />
          }}
        </MatchRoute>
      </Link>
    </div>
  )
}
```

The hook version `useMatchRoute` returns a function that can be called programmatically to check if a route is matched:

```tsx
function Component() {
  const matchRoute = useMatchRoute()

  useEffect(() => {
    if (matchRoute({ to: '/users', pending: true })) {
      console.info('The /users route is matched and pending')
    }
  })

  return (
    <div>
      <Link to="/users">Users</Link>
    </div>
  )
}
```

---

Phew! That's a lot of navigating! That said, hopefully you're feeling pretty good about getting around your application now. Let's move on!

# Not Found Errors

> ⚠️ This page covers the newer `notFound` function and `notFoundComponent` API for handling not found errors. The `NotFoundRoute` route is deprecated and will be removed in a future release. See [Migrating from `NotFoundRoute`](#migrating-from-notfoundroute) for more information.

## Overview

There are 2 uses for not-found errors in TanStack Router:

- **Non-matching route paths**: When a path does not match any known route matching pattern **OR** when it partially matches a route, but with extra path segments
  - The **router** will automatically throw a not-found error when a path does not match any known route matching pattern
  - If the router's `notFoundMode` is set to `fuzzy`, the nearest parent route with a `notFoundComponent` will handle the error. If the router's `notFoundMode` is set to `root`, the root route will handle the error.
  - Examples:
    - Attempting to access `/users` when there is no `/users` route
    - Attempting to access `/posts/1/edit` when the route tree only handles `/posts/$postId`
- **Missing resources**: When a resource cannot be found, such as a post with a given ID or any asynchronous data that is not available or does not exist
  - **You, the developer** must throw a not-found error when a resource cannot be found. This can be done in the `beforeLoad` or `loader` functions using the `notFound` utility.
  - Will be handled by the nearest parent route with a `notFoundComponent` (when `notFound` is called within `loader`) or the root route.
  - Examples:
    - Attempting to access `/posts/1` when the post with ID 1 does not exist
    - Attempting to access `/docs/path/to/document` when the document does not exist

Under the hood, both of these cases are implemented using the same `notFound` function and `notFoundComponent` API.

## The `notFoundMode` option

When TanStack Router encounters a **pathname** that doesn't match any known route pattern **OR** partially matches a route pattern but with extra trailing pathname segments, it will automatically throw a not-found error.

Depending on the `notFoundMode` option, the router will handle these automatic errors differently::

- ["fuzzy" mode](#notfoundmode-fuzzy) (default): The router will intelligently find the closest matching suitable route and display the `notFoundComponent`.
- ["root" mode](#notfoundmode-root): All not-found errors will be handled by the root route's `notFoundComponent`, regardless of the nearest matching route.

### `notFoundMode: 'fuzzy'`

By default, the router's `notFoundMode` is set to `fuzzy`, which indicates that if a pathname doesn't match any known route, the router will attempt to use the closest matching route with children/(an outlet) and a configured not found component.

> **❓ Why is this the default?** Fuzzy matching to preserve as much parent layout as possible for the user gives them more context to navigate to a useful location based on where they thought they would arrive.

The nearest suitable route is found using the following criteria:

- The route must have children and therefore an `Outlet` to render the `notFoundComponent`
- The route must have a `notFoundComponent` configured or the router must have a `defaultNotFoundComponent` configured

For example, consider the following route tree:

- `__root__` (has a `notFoundComponent` configured)
  - `posts` (has a `notFoundComponent` configured)
    - `$postId` (has a `notFoundComponent` configured)

If provided the path of `/posts/1/edit`, the following component structure will be rendered:

- `<Root>`
  - `<Posts>`
    - `<Posts.notFoundComponent>`

The `notFoundComponent` of the `posts` route will be rendered because it is the **nearest suitable parent route with children (and therefore an outlet) and a `notFoundComponent` configured**.

### `notFoundMode: 'root'`

When `notFoundMode` is set to `root`, all not-found errors will be handled by the root route's `notFoundComponent` instead of bubbling up from the nearest fuzzy-matched route.

For example, consider the following route tree:

- `__root__` (has a `notFoundComponent` configured)
  - `posts` (has a `notFoundComponent` configured)
    - `$postId` (has a `notFoundComponent` configured)

If provided the path of `/posts/1/edit`, the following component structure will be rendered:

- `<Root>`
  - `<Root.notFoundComponent>`

The `notFoundComponent` of the `__root__` route will be rendered because the `notFoundMode` is set to `root`.

## Configuring a route's `notFoundComponent`

To handle both types of not-found errors, you can attach a `notFoundComponent` to a route. This component will be rendered when a not-found error is thrown.

For example, configuring a `notFoundComponent` for a `/settings` route to handle non-existing settings pages:

```tsx
export const Route = createFileRoute('/settings')({
  component: () => {
    return (
      <div>
        <p>Settings page</p>
        <Outlet />
      </div>
    )
  },
  notFoundComponent: () => {
    return <p>This setting page doesn't exist!</p>
  },
})
```

Or configuring a `notFoundComponent` for a `/posts/$postId` route to handle posts that don't exist:

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    const post = await getPost(postId)
    if (!post) throw notFound()
    return { post }
  },
  component: ({ post }) => {
    return (
      <div>
        <h1>{post.title}</h1>
        <p>{post.body}</p>
      </div>
    )
  },
  notFoundComponent: () => {
    return <p>Post not found!</p>
  },
})
```

## Default Router-Wide Not Found Handling

You may want to provide a default not-found component for every route in your app with child routes.

> Why only routes with children? **Leaf-node routes (routes without children) will never render an `Outlet` and therefore are not able to handle not-found errors.**

To do this, pass a `defaultNotFoundComponent` to the `createRouter` function:

```tsx
const router = createRouter({
  defaultNotFoundComponent: () => {
    return (
      <div>
        <p>Not found!</p>
        <Link to="/">Go home</Link>
      </div>
    )
  },
})
```

## Throwing your own `notFound` errors

You can manually throw not-found errors in loader methods and components using the `notFound` function. This is useful when you need to signal that a resource cannot be found.

The `notFound` function works in a similar fashion to the `redirect` function. To cause a not-found error, you can **throw a `notFound()`**.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    // Returns `null` if the post doesn't exist
    const post = await getPost(postId)
    if (!post) {
      throw notFound()
      // Alternatively, you can make the notFound function throw:
      // notFound({ throw: true })
    }
    // Post is guaranteed to be defined here because we threw an error
    return { post }
  },
})
```

The not-found error above will be handled by the same route or nearest parent route that has either a `notFoundComponent` route option or the `defaultNotFoundComponent` router option configured.

If neither the route nor any suitable parent route is found to handle the error, the root route will handle it using TanStack Router's **extremely basic (and purposefully undesirable)** default not-found component that simply renders `<div>Not Found</div>`. It's highly recommended to either attach at least one `notFoundComponent` to the root route or configure a router-wide `defaultNotFoundComponent` to handle not-found errors.

## Specifying Which Routes Handle Not Found Errors

Sometimes you may want to trigger a not-found on a specific parent route and bypass the normal not-found component propagation. To do this, pass in a route id to the `route` option in the `notFound` function.

```tsx
// _pathlessLayout.tsx
export const Route = createFileRoute('/_pathlessLayout')({
  // This will render
  notFoundComponent: () => {
    return <p>Not found (in _pathlessLayout)</p>
  },
  component: () => {
    return (
      <div>
        <p>This is a pathless layout route!</p>
        <Outlet />
      </div>
    )
  },
})

// _pathlessLayout/route-a.tsx
export const Route = createFileRoute('/_pathless/route-a')({
  loader: async () => {
    // This will make LayoutRoute handle the not-found error
    throw notFound({ routeId: '/_pathlessLayout' })
    //                      ^^^^^^^^^ This will autocomplete from the registered router
  },
  // This WILL NOT render
  notFoundComponent: () => {
    return <p>Not found (in _pathlessLayout/route-a)</p>
  },
})
```

### Manually targeting the root route

You can also target the root route by passing the exported `rootRouteId` variable to the `notFound` function's `route` property:

```tsx
import { rootRouteId } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    const post = await getPost(postId)
    if (!post) throw notFound({ routeId: rootRouteId })
    return { post }
  },
})
```

### Throwing Not Found Errors in Components

You can also throw not-found errors in components. However, **it is recommended to throw not-found errors in loader methods instead of components in order to correctly type loader data and prevent flickering.**

TanStack Router exposes a `CatchNotFound` component similar to `CatchBoundary` that can be used to catch not-found errors in components and display UI accordingly.

### Data Loading Inside `notFoundComponent`

`notFoundComponent` is a special case when it comes to data loading. **`SomeRoute.useLoaderData` may not be defined depending on which route you are trying to access and where the not-found error gets thrown**. However, `Route.useParams`, `Route.useSearch`, `Route.useRouteContext`, etc. will return a defined value.

**If you need to pass incomplete loader data to `notFoundComponent`,** pass the data via the `data` option in the `notFound` function and validate it in `notFoundComponent`.

```tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params: { postId } }) => {
    const post = await getPost(postId)
    if (!post)
      throw notFound({
        // Forward some data to the notFoundComponent
        // data: someIncompleteLoaderData
      })
    return { post }
  },
  // `data: unknown` is passed to the component via the `data` option when calling `notFound`
  notFoundComponent: ({ data }) => {
    // ❌ useLoaderData is not valid here: const { post } = Route.useLoaderData()

    // ✅:
    const { postId } = Route.useParams()
    const search = Route.useSearch()
    const context = Route.useRouteContext()

    return <p>Post with id {postId} not found!</p>
  },
})
```

## Usage With SSR

See [SSR guide](../ssr.md) for more information.

## Migrating from `NotFoundRoute`

The `NotFoundRoute` API is deprecated in favor of `notFoundComponent`. The `NotFoundRoute` API will be removed in a future release.

**The `notFound` function and `notFoundComponent` will not work when using `NotFoundRoute`.**

The main differences are:

- `NotFoundRoute` is a route that requires an `<Outlet>` on its parent route to render. `notFoundComponent` is a component that can be attached to any route.
- When using `NotFoundRoute`, you can't use layouts. `notFoundComponent` can be used with layouts.
- When using `notFoundComponent`, path matching is strict. This means that if you have a route at `/post/$postId`, a not-found error will be thrown if you try to access `/post/1/2/3`. With `NotFoundRoute`, `/post/1/2/3` would match the `NotFoundRoute` and only render it if there is an `<Outlet>`.

To migrate from `NotFoundRoute` to `notFoundComponent`, you'll just need to make a few changes:

```tsx
// router.tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen.'
- import { notFoundRoute } from './notFoundRoute'  // [!code --]

export const router = createRouter({
  routeTree,
- notFoundRoute // [!code --]
})

// routes/__root.tsx
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  // ...
+ notFoundComponent: () => {  // [!code ++]
+   return <p>Not found!</p>  // [!code ++]
+ } // [!code ++]
})
```

Important changes:

- A `notFoundComponent` is added to the root route for global not-found handling.
  - You can also add a `notFoundComponent` to any other route in your route tree to handle not-found errors for that specific route.
- The `notFoundComponent` does not support rendering an `<Outlet>`.

# Outlets

Nested routing means that routes can be nested within other routes, including the way they render. So how do we tell our routes where to render this nested content?

## The `Outlet` Component

The `Outlet` component is used to render the next potentially matching child route. `<Outlet />` doesn't take any props and can be rendered anywhere within a route's component tree. If there is no matching child route, `<Outlet />` will render `null`.

> [!TIP]
> If a route's `component` is left undefined, it will render an `<Outlet />` automatically.

A great example is configuring the root route of your application. Let's give our root route a component that renders a title, then an `<Outlet />` for our top-level routes to render.

```tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: RootComponent,
})

function RootComponent() {
  return (
    <div>
      <h1>My App</h1>
      <Outlet /> {/* This is where child routes will render */}
    </div>
  )
}
```

# Parallel Routes

We haven't covered this yet. Stay tuned!

# Path Params

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

> 🧠 Quick tip: If your component is code-split, you can use the [getRouteApi function](../code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useParams()` hook.

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

## Allowed Characters

By default, path params are escaped with `encodeURIComponent`. If you want to allow other valid URI characters (e.g. `@` or `+`), you can specify that in your [RouterOptions](../../api/router/RouterOptionsType.md#pathparamsallowedcharacters-property)

Example usage:

```tsx
const router = createRouter({
  ...
  pathParamsAllowedCharacters: ['@']
})
```

The following is the list of accepted allowed characters:
`;` `:` `@` `&` `=` `+` `$` `,`

# Preloading

Preloading in TanStack Router is a way to load a route before the user actually navigates to it. This is useful for routes that are likely to be visited by the user next. For example, if you have a list of posts and the user is likely to click on one of them, you can preload the post route so that it's ready to go when the user clicks on it.

## Supported Preloading Strategies

- Intent
  - Preloading by **"intent"** works by using hover and touch start events on `<Link>` components to preload the dependencies for the destination route.
  - This strategy is useful for preloading routes that the user is likely to visit next.
- Viewport Visibility
  - Preloading by **"viewport**" works by using the Intersection Observer API to preload the dependencies for the destination route when the `<Link>` component is in the viewport.
  - This strategy is useful for preloading routes that are below the fold or off-screen.
- Render
  - Preloading by **"render"** works by preloading the dependencies for the destination route as soon as the `<Link>` component is rendered in the DOM.
  - This strategy is useful for preloading routes that are always needed.

## How long does preloaded data stay in memory?

Preloaded route matches are temporarily cached in memory with a few important caveats:

- **Unused preloaded data is removed after 30 seconds by default.** This can be configured by setting the `defaultPreloadMaxAge` option on your router.
- **Obviously, when a a route is loaded, its preloaded version is promoted to the router's normal pending matches state.**

If you need more control over preloading, caching and/or garbage collection of preloaded data, you should use an external caching library like [TanStack Query](https://tanstack.com/query).

The simplest way to preload routes for your application is to set the `defaultPreload` option to `intent` for your entire router:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreload: 'intent',
})
```

This will turn on `intent` preloading by default for all `<Link>` components in your application. You can also set the `preload` prop on individual `<Link>` components to override the default behavior.

## Preload Delay

By default, preloading will start after **50ms** of the user hovering or touching a `<Link>` component. You can change this delay by setting the `defaultPreloadDelay` option on your router:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadDelay: 100,
})
```

You can also set the `preloadDelay` prop on individual `<Link>` components to override the default behavior on a per-link basis.

## Built-in Preloading & `preloadStaleTime`

If you're using the built-in loaders, you can control how long preloaded data is considered fresh until another preload is triggered by setting either `routerOptions.defaultPreloadStaleTime` or `routeOptions.preloadStaleTime` to a number of milliseconds. **By default, preloaded data is considered fresh for 30 seconds.**.

To change this, you can set the `defaultPreloadStaleTime` option on your router:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 10_000,
})
```

Or, you can use the `routeOptions.preloadStaleTime` option on individual routes:

```tsx
// src/routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  // Preload the route again if the preload cache is older than 10 seconds
  preloadStaleTime: 10_000,
})
```

## Preloading with External Libraries

When integrating external caching libraries like React Query, which have their own mechanisms for determining stale data, you may want to override the default preloading and stale-while-revalidate logic of TanStack Router. These libraries often use options like staleTime to control the freshness of data.

To customize the preloading behavior in TanStack Router and fully leverage your external library's caching strategy, you can bypass the built-in caching by setting routerOptions.defaultPreloadStaleTime or routeOptions.preloadStaleTime to 0. This ensures that all preloads are marked as stale internally, and loaders are always invoked, allowing your external library, such as React Query, to manage data loading and caching.

For example:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 0,
})
```

This would then allow you, for instance, to use an option like React Query's `staleTime` to control the freshness of your preloads.

## Preloading Manually

If you need to manually preload a route, you can use the router's `preloadRoute` method. It accepts a standard TanStack `NavigateOptions` object and returns a promise that resolves when the route is preloaded.

```tsx
function Component() {
  const router = useRouter()

  useEffect(() => {
    async function preload() {
      try {
        const matches = await router.preloadRoute({
          to: postRoute,
          params: { id: 1 },
        })
      } catch (err) {
        // Failed to preload route
      }
    }

    preload()
  }, [router])

  return <div />
}
```

If you need to preload only the JS chunk of a route, you can use the router's `loadRouteChunk` method. It accepts a route object and returns a promise that resolves when the route chunk is loaded.

```tsx
function Component() {
  const router = useRouter()

  useEffect(() => {
    async function preloadRouteChunks() {
      try {
        const postsRoute = router.routesByPath['/posts']
        await Promise.all([
          router.loadRouteChunk(router.routesByPath['/']),
          router.loadRouteChunk(postsRoute),
          router.loadRouteChunk(postsRoute.parentRoute),
        ])
      } catch (err) {
        // Failed to preload route chunk
      }
    }

    preloadRouteChunks()
  }, [router])

  return <div />
}
```

# Render Optimizations

TanStack Router includes several optimizations to ensure your components only re-render when necessary. These optimizations include:

## structural sharing

TanStack Router uses a technique called "structural sharing" to preserve as many references as possible between re-renders, which is particularly useful for state stored in the URL, such as search parameters.

For example, consider a `details` route with two search parameters, `foo` and `bar`, accessed like this:

```tsx
const search = Route.useSearch()
```

When only `bar` is changed by navigating from `/details?foo=f1&bar=b1` to `/details?foo=f1&bar=b2`, `search.foo` will be referentially stable and only `search.bar` will be replaced.

## fine-grained selectors

You can access and subscribe to the router state using various hooks like `useRouterState`, `useSearch`, and others. If you only want a specific component to re-render when a particular subset of the router state such as a subset of the search parameters changes, you can use partial subscriptions with the `select` property.

```tsx
// component won't re-render when `bar` changes
const foo = Route.useSearch({ select: ({ foo }) => foo })
```

### structural sharing with fine-grained selectors

The `select` function can perform various calculations on the router state, allowing you to return different types of values, such as objects. For example:

```tsx
const result = Route.useSearch({
  select: (search) => {
    return {
      foo: search.foo,
      hello: `hello ${search.foo}`,
    }
  },
})
```

Although this works, it will cause your component to re-render each time, since `select` is now returning a new object each time it’s called.

You can avoid this re-rendering issue by using "structural sharing" as described above. By default, structural sharing is turned off to maintain backward compatibility, but this may change in v2.

To enable structural sharing for fine grained selectors, you have two options:

#### Enable it by default in the router options:

```tsx
const router = createRouter({
  routeTree,
  defaultStructuralSharing: true,
})
```

#### Enable it per hook usage as shown here:

```tsx
const result = Route.useSearch({
  select: (search) => {
    return {
      foo: search.foo,
      hello: `hello ${search.foo}`,
    }
  },
  structuralSharing: true,
})
```

> [!IMPORTANT]
> Structural sharing only works with JSON-compatible data. This means you cannot use `select` to return items like class instances if structural sharing is enabled.

In line with TanStack Router's type-safe design, TypeScript will raise an error if you attempt the following:

```tsx
const result = Route.useSearch({
  select: (search) => {
    return {
      date: new Date(),
    }
  },
  structuralSharing: true,
})
```

If structural sharing is enabled by default in the router options, you can prevent this error by setting `structuralSharing: false`.

# Route Masking

Route masking is a way to mask the actual URL of a route that gets persisted to the browser's history and URL bar. This is useful for scenarios where you want to show a different URL than the one that is actually being navigated to and then falling back to the displayed URL when it is shared and (optionally) when the page is reloaded. Here's a few examples:

- Navigating to a modal route like `/photo/5/modal`, but masking the actual URL as `/photos/5`
- Navigating to a modal route like `/post/5/comments`, but masking the actual URL as `/posts/5`
- Navigating to a route with the search param `?showLogin=true`, but masking the URL to _not_ contain the search param
- Navigating to a route with the search param `?modal=settings`, but masking the URL as `/settings'

Each of these scenarios can be achieved with route masking and even extended to support more advanced patterns like [parallel routes](../parallel-routes.md).

## How does route masking work?

> [!IMPORTANT]
> You **do not** need to understand how route masking works in order to use it. This section is for those who are curious about how it works under the hood. Skip to [How do I use route masking?](#how-do-i-use-route-masking) to learn how to use it!.

Route masking utilizes the `location.state` API to store the desired runtime location inside of the location that will get written to the URL. It stores this runtime location under the `__tempLocation` state property:

```tsx
const location = {
  pathname: '/photos/5',
  search: '',
  hash: '',
  state: {
    key: 'wesdfs',
    __tempKey: 'sadfasd',
    __tempLocation: {
      pathname: '/photo/5/modal',
      search: '',
      hash: '',
      state: {},
    },
  },
}
```

When the router parses a location from history with the `location.state.__tempLocation` property, it will use that location instead of the one that was parsed from the URL. This allows you to navigate to a route like `/photos/5` and have the router actually navigate to `/photo/5/modal` instead. When this happens, the history location is saved back into the `location.maskedLocation` property, just in case we need to know what the **actual URL** is. One example of where this is used is in the Devtools where we detect if a route is masked and show the actual URL instead of the masked one!

Remember, you don't need to worry about any of this. It's all handled for you automatically under the hood!

## How do I use route masking?

Route masking is a simple API that can be used in 2 ways:

- Imperatively via the `mask` option available on the `<Link>` and `navigate()` APIs
- Declaratively via the Router's `routeMasks` option

When using either route masking APIs, the `mask` option accepts the same navigation object that the `<Link>` and `navigate()` APIs accept. This means you can use the same `to`, `replace`, `state`, and `search` options that you're already familiar with. The only difference is that the `mask` option will be used to mask the URL of the route being navigated to.

> 🧠 The mask option is also **type-safe**! This means that if you're using TypeScript, you'll get type errors if you try to pass an invalid navigation object to the `mask` option. Booyah!

### Imperative route masking

The `<Link>` and `navigate()` APIs both accept a `mask` option that can be used to mask the URL of the route being navigated to. Here's an example of using it with the `<Link>` component:

```tsx
<Link
  to="/photos/$photoId/modal"
  params={{ photoId: 5 }}
  mask={{
    to: '/photos/$photoId',
    params: {
      photoId: 5,
    },
  }}
>
  Open Photo
</Link>
```

And here's an example of using it with the `navigate()` API:

```tsx
const navigate = useNavigate()

function onOpenPhoto() {
  navigate({
    to: '/photos/$photoId/modal',
    params: { photoId: 5 },
    mask: {
      to: '/photos/$photoId',
      params: {
        photoId: 5,
      },
    },
  })
}
```

### Declarative route masking

In addition to the imperative API, you can also use the Router's `routeMasks` option to declaratively mask routes. Instead of needing to pass the `mask` option to every `<Link>` or `navigate()` call, you can instead create a route mask on the Router to mask routes that match a certain pattern. Here's an example of the same route mask from above, but using the `routeMasks` option instead:

// Use the following for the example below

```tsx
import { createRouteMask } from '@tanstack/react-router'

const photoModalToPhotoMask = createRouteMask({
  routeTree,
  from: '/photos/$photoId/modal',
  to: '/photos/$photoId',
  params: (prev) => ({
    photoId: prev.photoId,
  }),
})

const router = createRouter({
  routeTree,
  routeMasks: [photoModalToPhotoMask],
})
```

When creating a route mask, you'll need to pass 1 argument with at least:

- `routeTree` - The route tree that the route mask will be applied to
- `from` - The route ID that the route mask will be applied to
- `...navigateOptions` - The standard `to`, `search`, `params`, `replace`, etc options that the `<Link>` and `navigate()` APIs accept

> 🧠 The `createRouteMask` option is also **type-safe**! This means that if you're using TypeScript, you'll get type errors if you try to pass an invalid route mask to the `routeMasks` option.

## Unmasking when sharing the URL

URLs are automatically unmasked when they are shared since as soon as a URL is detached from your browsers local history stack, the URL masking data is no longer available. Essentially, as soon as you copy and paste a URL out of your history, its masking data is lost... after all, that's the point of masking a URL!

## Local Unmasking Defaults

**By default, URLs are not unmasked when the page is reloaded locally**. Masking data is stored in the `location.state` property of the history location, so as long as the history location is still in memory in your history stack, the masking data will be available and the URL will continue to be masked.

## Unmasking on page reload

**As stated above, URLs are not unmasked when the page is reloaded by default**.

If you want to unmask a URL locally when the page is reloaded, you have 3 options, each overriding the previous one in priority if passed:

- Set the Router's default `unmaskOnReload` option to `true`
- Return the `unmaskOnReload: true` option from the masking function when creating a route mask with `createRouteMask()`
- Pass the `unmaskOnReload: true` option to the `<Link`> component or `navigate()` API

# Router Context

TanStack Router's router context is a very powerful tool that can be used for dependency injection among many other things. Aptly named, the router context is passed through the router and down through each matching route. At each route in the hierarchy, the context can be modified or added to. Here's a few ways you might use the router context practically:

- Dependency Injection
  - You can supply dependencies (e.g. a loader function, a data fetching client, a mutation service) which the route and all child routes can access and use without importing or creating directly.
- Breadcrumbs
  - While the main context object for each route is merged as it descends, each route's unique context is also stored making it possible to attach breadcrumbs or methods to each route's context.
- Dynamic meta tag management
  - You can attach meta tags to each route's context and then use a meta tag manager to dynamically update the meta tags on the page as the user navigates the site.

These are just suggested uses of the router context. You can use it for whatever you want!

## Typed Router Context

Like everything else, the root router context is strictly typed. This type can be augmented via any route's `beforeLoad` option as it is merged down the route match tree. To constrain the type of the root router context, you must use the `createRootRouteWithContext<YourContextTypeHere>()(routeOptions)` function to create a new router context instead of the `createRootRoute()` function to create your root route. Here's an example:

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'

interface MyRouterContext {
  user: User
}

// Use the routerContext to create your root route
const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const routeTree = rootRoute.addChildren([
  // ...
])

// Use the routerContext to create your router
const router = createRouter({
  routeTree,
})
```

## Passing the initial Router Context

The router context is passed to the router at instantiation time. You can pass the initial router context to the router via the `context` option:

> [!TIP]
> If your context has any required properties, you will see a TypeScript error if you don't pass them in the initial router context. If all of your context properties are optional, you will not see a TypeScript error and passing the context will be optional. If you don't pass a router context, it defaults to `{}`.

```tsx
import { createRouter } from '@tanstack/react-router'

// Use the routerContext you created to create your router
const router = createRouter({
  routeTree,
  context: {
    user: {
      id: '123',
      name: 'John Doe',
    },
  },
})
```

### Invalidating the Router Context

If you need to invalidate the context state you are passing into the router, you can call the `invalidate` method to tell the router to recompute the context. This is useful when you need to update the context state and have the router recompute the context for all routes.

```tsx
function useAuth() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user)
      router.invalidate()
    })

    return unsubscribe
  }, [])

  return user
}
```

## Using the Router Context

Once you have defined the router context type, you can use it in your route definitions:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: ({ context }) => fetchTodosByUserId(context.user.id),
})
```

You can even inject data fetching and mutation implementations themselves! In fact, this is highly recommended 😜

Let's try this with a simple function to fetch some todos:

```tsx
const fetchTodosByUserId = async ({ userId }) => {
  const response = await fetch(`/api/todos?userId=${userId}`)
  const data = await response.json()
  return data
}

const router = createRouter({
  routeTree: rootRoute,
  context: {
    userId: '123',
    fetchTodosByUserId,
  },
})
```

Then, in your route:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: ({ context }) => context.fetchTodosByUserId(context.userId),
})
```

### How about an external data fetching library?

```tsx
import {
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router'

interface MyRouterContext {
  queryClient: QueryClient
}

const rootRoute = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})

const queryClient = new QueryClient()

const router = createRouter({
  routeTree: rootRoute,
  context: {
    queryClient,
  },
})
```

Then, in your route:

```tsx
// src/routes/todos.tsx
export const Route = createFileRoute('/todos')({
  component: Todos,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData({
      queryKey: ['todos', { userId: user.id }],
      queryFn: fetchTodos,
    })
  },
})
```

## How about using React Context/Hooks?

When trying to use React Context or Hooks in your route's `beforeLoad` or `loader` functions, it's important to remember React's [Rules of Hooks](https://react.dev/reference/rules/rules-of-hooks). You can't use hooks in a non-React function, so you can't use hooks in your `beforeLoad` or `loader` functions.

So, how do we use React Context or Hooks in our route's `beforeLoad` or `loader` functions? We can use the router context to pass down the React Context or Hooks to our route's `beforeLoad` or `loader` functions.

Let's look at the setup for an example, where we pass down a `useNetworkStrength` hook to our route's `loader` function:

- `src/routes/__root.tsx`

```tsx
// First, make sure the context for the root route is typed
import { createRootRouteWithContext } from '@tanstack/react-router'
import { useNetworkStrength } from '@/hooks/useNetworkStrength'

interface MyRouterContext {
  networkStrength: ReturnType<typeof useNetworkStrength>
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})
```

In this example, we'd instantiate the hook before rendering the router using the `<RouterProvider />`. This way, the hook would be called in React-land, therefore adhering to the Rules of Hooks.

- `src/router.tsx`

```tsx
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

export const router = createRouter({
  routeTree,
  context: {
    networkStrength: undefined!, // We'll set this in React-land
  },
})
```

- `src/main.tsx`

```tsx
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

import { useNetworkStrength } from '@/hooks/useNetworkStrength'

function App() {
  const networkStrength = useNetworkStrength()
  // Inject the returned value from the hook into the router context
  return <RouterProvider router={router} context={{ networkStrength }} />
}

// ...
```

So, now in our route's `loader` function, we can access the `networkStrength` hook from the router context:

- `src/routes/posts.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: Posts,
  loader: ({ context }) => {
    if (context.networkStrength === 'STRONG') {
      // Do something
    }
  },
})
```

## Modifying the Router Context

The router context is passed down the route tree and is merged at each route. This means that you can modify the context at each route and the modifications will be available to all child routes. Here's an example:

- `src/routes/__root.tsx`

```tsx
import { createRootRouteWithContext } from '@tanstack/react-router'

interface MyRouterContext {
  foo: boolean
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: App,
})
```

- `src/router.tsx`

```tsx
import { createRouter } from '@tanstack/react-router'

import { routeTree } from './routeTree.gen'

const router = createRouter({
  routeTree,
  context: {
    foo: true,
  },
})
```

- `src/routes/todos.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/todos')({
  component: Todos,
  beforeLoad: () => {
    return {
      bar: true,
    }
  },
  loader: ({ context }) => {
    context.foo // true
    context.bar // true
  },
})
```

## Processing Accumulated Route Context

Context, especially the isolated route `context` objects, make it trivial to accumulate and process the route context objects for all matched routes. Here's an example where we use all of the matched route contexts to generate a breadcrumb trail:

```tsx
// src/routes/__root.tsx
export const Route = createRootRoute({
  component: () => {
    const matches = useRouterState({ select: (s) => s.matches })

    const breadcrumbs = matches
      .filter((match) => match.context.getTitle)
      .map(({ pathname, context }) => {
        return {
          title: context.getTitle(),
          path: pathname,
        }
      })

    // ...
  },
})
```

Using that same route context, we could also generate a title tag for our page's `<head>`:

```tsx
// src/routes/__root.tsx
export const Route = createRootRoute({
  component: () => {
    const matches = useRouterState({ select: (s) => s.matches })

    const matchWithTitle = [...matches]
      .reverse()
      .find((d) => d.context.getTitle)

    const title = matchWithTitle?.context.getTitle() || 'My App'

    return (
      <html>
        <head>
          <title>{title}</title>
        </head>
        <body>{/* ... */}</body>
      </html>
    )
  },
})
```

# Scroll Restoration

## Hash/Top-of-Page Scrolling

Out of the box, TanStack Router supports both **hash scrolling** and **top-of-page scrolling** without any additional configuration.

## Scroll-to-top & Nested Scrollable Areas

By default, scroll-to-top mimics the behavior of the browser, which means only the `window` itself is scrolled to the top after successful navigation. For many apps however, it's common for the main scrollable area to be a nested div or similar because of advanced layouts. If you would like TanStack Router to also scroll these main scrollable areas for you, you can add selectors to target them using the `routerOptions.scrollToTopSelectors`:

```tsx
const router = createRouter({
  scrollToTopSelectors: ['#main-scrollable-area'],
})
```

These selectors are handled **in addition to `window`** which cannot be disabled currently.

## Scroll Restoration

Scroll restoration is the process of restoring the scroll position of a page when the user navigates back to it. This is normally a built-in feature for standard HTML based websites, but can be difficult to replicate for SPA applications because:

- SPAs typically use the `history.pushState` API for navigation, so the browser doesn't know to restore the scroll position natively
- SPAs sometimes render content asynchronously, so the browser doesn't know the height of the page until after it's rendered
- SPAs can sometimes use nested scrollable containers to force specific layouts and features.

Not only that, but it's very common for applications to have multiple scrollable areas within an app, not just the body. For example, a chat application might have a scrollable sidebar and a scrollable chat area. In this case, you would want to restore the scroll position of both areas independently.

To alleviate this problem, TanStack Router provides a scroll restoration component and hook that handle the process of monitoring, caching and restoring scroll positions for you.

It does this by:

- Monitoring the DOM for scroll events
- Registering scrollable areas with the scroll restoration cache
- Listening to the proper router events to know when to cache and restore scroll positions
- Storing scroll positions for each scrollable area in the cache (including `window` and `body`)
- Restoring scroll positions after successful navigations before DOM paint

That may sound like a lot, but for you, it's as simple as this:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  scrollRestoration: true,
})
```

> [!NOTE]
> The `<ScrollRestoration />` component still works, but has been deprecated.

## Custom Cache Keys

Falling in behind Remix's own Scroll Restoration APIs, you can also customize the key used to cache scroll positions for a given scrollable area using the `getKey` option. This could be used, for example, to force the same scroll position to be used regardless of the users browser history.

The `getKey` option receives the relevant `Location` state from TanStack Router and expects you to return a string to uniquely identify the scrollable measurements for that state.

The default `getKey` is `(location) => location.state.key!`, where `key` is the unique key generated for each entry in the history.

## Examples

You could sync scrolling to the pathname:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  getScrollRestorationKey: (location) => location.pathname,
})
```

You can conditionally sync only some paths, then use the key for the rest:

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  getScrollRestorationKey: (location) => {
    const paths = ['/', '/chat']
    return paths.includes(location.pathname)
      ? location.pathname
      : location.state.key!
  },
})
```

## Preventing Scroll Restoration

Sometimes you may want to prevent scroll restoration from happening. To do this you can utilize the `resetScroll` option available on the following APIs:

- `<Link resetScroll={false}>`
- `navigate({ resetScroll: false })`
- `redirect({ resetScroll: false })`

When `resetScroll` is set to `false`, the scroll position for the next navigation will not be restored (if navigating to an existing history event in the stack) or reset to the top (if it's a new history event in the stack).

## Manual Scroll Restoration

Most of the time, you won't need to do anything special to get scroll restoration to work. However, there are some cases where you may need to manually control scroll restoration. The most common example is **virtualized lists**.

To manually control scroll restoration for virtualized lists within the whole browser window:

[//]: # 'VirtualizedWindowScrollRestorationExample'

```tsx
function Component() {
  const scrollEntry = useElementScrollRestoration({
    getElement: () => window,
  })

  // Let's use TanStack Virtual to virtualize some content!
  const virtualizer = useWindowVirtualizer({
    count: 10000,
    estimateSize: () => 100,
    // We pass the scrollY from the scroll restoration entry to the virtualizer
    // as the initial offset
    initialOffset: scrollEntry?.scrollY,
  })

  return (
    <div>
      {virtualizer.getVirtualItems().map(item => (
        ...
      ))}
    </div>
  )
}
```

[//]: # 'VirtualizedWindowScrollRestorationExample'

To manually control scroll restoration for a specific element, you can use the `useElementScrollRestoration` hook and the `data-scroll-restoration-id` DOM attribute:

[//]: # 'ManualRestorationExample'

```tsx
function Component() {
  // We need a unique ID for manual scroll restoration on a specific element
  // It should be as unique as possible for this element across your app
  const scrollRestorationId = 'myVirtualizedContent'

  // We use that ID to get the scroll entry for this element
  const scrollEntry = useElementScrollRestoration({
    id: scrollRestorationId,
  })

  // Let's use TanStack Virtual to virtualize some content!
  const virtualizerParentRef = React.useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: 10000,
    getScrollElement: () => virtualizerParentRef.current,
    estimateSize: () => 100,
    // We pass the scrollY from the scroll restoration entry to the virtualizer
    // as the initial offset
    initialOffset: scrollEntry?.scrollY,
  })

  return (
    <div
      ref={virtualizerParentRef}
      // We pass the scroll restoration ID to the element
      // as a custom attribute that will get picked up by the
      // scroll restoration watcher
      data-scroll-restoration-id={scrollRestorationId}
      className="flex-1 border rounded-lg overflow-auto relative"
    >
      ...
    </div>
  )
}
```

[//]: # 'ManualRestorationExample'

## Scroll Behavior

To control the scroll behavior when navigating between pages, you can use the `scrollRestorationBehavior` option. This allows you to make the transition between pages instant instead of a smooth scroll. The global configuration of scroll restoration behavior has the same options as those supported by the browser, which are `smooth`, `instant`, and `auto` (see [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView#behavior) for more information).

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  scrollRestorationBehavior: 'instant',
})
```

# Search Params

Similar to how TanStack Query made handling server-state in your React and Solid applications a breeze, TanStack Router aims to unlock the power of URL search params in your applications.

> 🧠 If you are on a really old browser, like IE11, you may need to use a polyfill for `URLSearchParams`.

## Why not just use `URLSearchParams`?

We get it, you've been hearing a lot of "use the platform" lately and for the most part, we agree. However, we also believe it's important to recognize where the platform falls short for more advanced use-cases and we believe `URLSearchParams` is one of these circumstances.

Traditional Search Param APIs usually assume a few things:

- Search params are always strings
- They are _mostly_ flat
- Serializing and deserializing using `URLSearchParams` is good enough (Spoiler alert: it's not.)
- Search params modifications are tightly coupled with the URL's pathname and must be updated together, even if the pathname is not changing.

Reality is very different from these assumptions though.

- Search params represent application state, so inevitably, we will expect them to have the same DX associated with other state managers. This means having the capability of distinguishing between primitive value types and efficiently storing and manipulating complex data structures like nested arrays and objects.
- There are many ways to serialize and deserialize state with different tradeoffs. You should be able to choose the best one for your application or at the very least get a better default than `URLSearchParams`.
- Immutability & Structural Sharing. Every time you stringify and parse url search params, referential integrity and object identity is lost because each new parse creates a brand new data structure with a unique memory reference. If not properly managed over its lifetime, this constant serialization and parsing can result in unexpected and undesirable performance issues, especially in frameworks like React that choose to track reactivity via immutability or in Solid that normally relies on reconciliation to detect changes from deserialized data sources.
- Search params, while an important part of the URL, do frequently change independently of the URL's pathname. For example, a user may want to change the page number of a paginated list without touching the URL's pathname.

## Search Params, the "OG" State Manager

You've probably seen search params like `?page=3` or `?filter-name=tanner` in the URL. There is no question that this is truly **a form of global state** living inside of the URL. It's valuable to store specific pieces of state in the URL because:

- Users should be able to:
  - Cmd/Ctrl + Click to open a link in a new tab and reliably see the state they expected
  - Bookmark and share links from your application with others with assurances that they will see exactly the state as when the link was copied.
  - Refresh your app or navigate back and forth between pages without losing their state
- Developers should be able to easily:
  - Add, remove or modify state in the URL with the same great DX as other state managers
  - Easily validate search params coming from the URL in a format and type that is safe for their application to consume
  - Read and write to search params without having to worry about the underlying serialization format

## JSON-first Search Params

To achieve the above, the first step built in to TanStack Router is a powerful search param parser that automatically converts the search string of your URL to structured JSON. This means that you can store any JSON-serializable data structure in your search params and it will be parsed and serialized as JSON. This is a huge improvement over `URLSearchParams` which has limited support for array-like structures and nested data.

For example, navigating to the following route:

```tsx
const link = (
  <Link
    to="/shop"
    search={{
      pageIndex: 3,
      includeCategories: ['electronics', 'gifts'],
      sortBy: 'price',
      desc: true,
    }}
  />
)
```

Will result in the following URL:

```
/shop?pageIndex=3&includeCategories=%5B%22electronics%22%2C%22gifts%22%5D&sortBy=price&desc=true
```

When this URL is parsed, the search params will be accurately converted back to the following JSON:

```json
{
  "pageIndex": 3,
  "includeCategories": ["electronics", "gifts"],
  "sortBy": "price",
  "desc": true
}
```

If you noticed, there are a few things going on here:

- The first level of the search params is flat and string based, just like `URLSearchParams`.
- First level values that are not strings are accurately preserved as actual numbers and booleans.
- Nested data structures are automatically converted to URL-safe JSON strings

> 🧠 It's common for other tools to assume that search params are always flat and string-based which is why we've chosen to keep things URLSearchParam compliant at the first level. This ultimately means that even though TanStack Router is managing your nested search params as JSON, other tools will still be able to write to the URL and read first-level params normally.

## Validating and Typing Search Params

Despite TanStack Router being able to parse search params into reliable JSON, they ultimately still came from **a user-facing raw-text input**. Similar to other serialization boundaries, this means that before you consume search params, they should be validated into a format that your application can trust and rely on.

### Enter Validation + TypeScript!

TanStack Router provides convenient APIs for validating and typing search params. This all starts with the `Route`'s `validateSearch` option:

```tsx
// /routes/shop.products.tsx

type ProductSearchSortOptions = 'newest' | 'oldest' | 'price'

type ProductSearch = {
  page: number
  filter: string
  sort: ProductSearchSortOptions
}

export const Route = createFileRoute('/shop/products')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    // validate and parse the search params into a typed state
    return {
      page: Number(search?.page ?? 1),
      filter: (search.filter as string) || '',
      sort: (search.sort as ProductSearchSortOptions) || 'newest',
    }
  },
})
```

In the above example, we're validating the search params of the `Route` and returning a typed `ProductSearch` object. This typed object is then made available to this route's other options **and any child routes, too!**

### Validating Search Params

The `validateSearch` option is a function that is provided the JSON parsed (but non-validated) search params as a `Record<string, unknown>` and returns a typed object of your choice. It's usually best to provide sensible fallbacks for malformed or unexpected search params so your users' experience stays non-interrupted.

Here's an example:

```tsx
// /routes/shop.products.tsx

type ProductSearchSortOptions = 'newest' | 'oldest' | 'price'

type ProductSearch = {
  page: number
  filter: string
  sort: ProductSearchSortOptions
}

export const Route = createFileRoute('/shop/products')({
  validateSearch: (search: Record<string, unknown>): ProductSearch => {
    // validate and parse the search params into a typed state
    return {
      page: Number(search?.page ?? 1),
      filter: (search.filter as string) || '',
      sort: (search.sort as ProductSearchSortOptions) || 'newest',
    }
  },
})
```

Here's an example using the [Zod](https://zod.dev/) library (but feel free to use any validation library you want) to both validate and type the search params in a single step:

```tsx
// /routes/shop.products.tsx

import { z } from 'zod'

const productSearchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().catch(''),
  sort: z.enum(['newest', 'oldest', 'price']).catch('newest'),
})

type ProductSearch = z.infer<typeof productSearchSchema>

export const Route = createFileRoute('/shop/products')({
  validateSearch: (search) => productSearchSchema.parse(search),
})
```

Because `validateSearch` also accepts an object with the `parse` property, this can be shortened to:

```tsx
validateSearch: productSearchSchema
```

In the above example, we used Zod's `.catch()` modifier instead of `.default()` to avoid showing an error to the user because we firmly believe that if a search parameter is malformed, you probably don't want to halt the user's experience through the app to show a big fat error message. That said, there may be times that you **do want to show an error message**. In that case, you can use `.default()` instead of `.catch()`.

The underlying mechanics why this works relies on the `validateSearch` function throwing an error. If an error is thrown, the route's `onError` option will be triggered (and `error.routerCode` will be set to `VALIDATE_SEARCH` and the `errorComponent` will be rendered instead of the route's `component` where you can handle the search param error however you'd like.

#### Adapters

When using a library like [Zod](https://zod.dev/) to validate search params you might want to `transform` search params before committing the search params to the URL. A common `zod` `transform` is `default` for example.

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

const productSearchSchema = z.object({
  page: z.number().default(1),
  filter: z.string().default(''),
  sort: z.enum(['newest', 'oldest', 'price']).default('newest'),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

It might be surprising that when you try to navigate to this route, `search` is required. The following `Link` will type error as `search` is missing.

```tsx
<Link to="/shop/products" />
```

For validation libraries we recommend using adapters which infer the correct `input` and `output` types.

### Zod

An adapter is provided for [Zod](https://zod.dev/) which will pipe through the correct `input` type and `output` type

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const productSearchSchema = z.object({
  page: z.number().default(1),
  filter: z.string().default(''),
  sort: z.enum(['newest', 'oldest', 'price']).default('newest'),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: zodValidator(productSearchSchema),
})
```

The important part here is the following use of `Link` no longer requires `search` params

```tsx
<Link to="/shop/products" />
```

However the use of `catch` here overrides the types and makes `page`, `filter` and `sort` `unknown` causing type loss. We have handled this case by providing a `fallback` generic function which retains the types but provides a `fallback` value when validation fails

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { fallback, zodValidator } from '@tanstack/zod-adapter'
import { z } from 'zod'

const productSearchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  filter: fallback(z.string(), '').default(''),
  sort: fallback(z.enum(['newest', 'oldest', 'price']), 'newest').default(
    'newest',
  ),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: zodValidator(productSearchSchema),
})
```

Therefore when navigating to this route, `search` is optional and retains the correct types.

While not recommended, it is also possible to configure `input` and `output` type in case the `output` type is more accurate than the `input` type

```tsx
const productSearchSchema = z.object({
  page: fallback(z.number(), 1).default(1),
  filter: fallback(z.string(), '').default(''),
  sort: fallback(z.enum(['newest', 'oldest', 'price']), 'newest').default(
    'newest',
  ),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: zodValidator({
    schema: productSearchSchema,
    input: 'output',
    output: 'input',
  }),
})
```

This provides flexibility in which type you want to infer for navigation and which types you want to infer for reading search params.

### Valibot

> [!WARNING]
> Router expects the valibot 1.0 package to be installed.

When using [Valibot](https://valibot.dev/) an adapter is not needed to ensure the correct `input` and `output` types are used for navigation and reading search params. This is because `valibot` implements [Standard Schema](https://github.com/standard-schema/standard-schema)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import * as v from 'valibot'

const productSearchSchema = v.object({
  page: v.optional(v.fallback(v.number(), 1), 1),
  filter: v.optional(v.fallback(v.string(), ''), ''),
  sort: v.optional(
    v.fallback(v.picklist(['newest', 'oldest', 'price']), 'newest'),
    'newest',
  ),
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

### Arktype

> [!WARNING]
> Router expects the arktype 2.0-rc package to be installed.

When using [ArkType](https://arktype.io/) an adapter is not needed to ensure the correct `input` and `output` types are used for navigation and reading search params. This is because [ArkType](https://arktype.io/) implements [Standard Schema](https://github.com/standard-schema/standard-schema)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { type } from 'arktype'

const productSearchSchema = type({
  page: 'number = 1',
  filter: 'string = ""',
  sort: '"newest" | "oldest" | "price" = "newest"',
})

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

### Effect/Schema

When using [Effect/Schema](https://effect.website/docs/schema/introduction/) an adapter is not needed to ensure the correct `input` and `output` types are used for navigation and reading search params. This is because [Effect/Schema](https://effect.website/docs/schema/standard-schema/) implements [Standard Schema](https://github.com/standard-schema/standard-schema)

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { Schema as S } from 'effect'

const productSearchSchema = S.standardSchemaV1(
  S.Struct({
    page: S.NumberFromString.pipe(
      S.optional,
      S.withDefaults({
        constructor: () => 1,
        decoding: () => 1,
      }),
    ),
    filter: S.String.pipe(
      S.optional,
      S.withDefaults({
        constructor: () => '',
        decoding: () => '',
      }),
    ),
    sort: S.Literal('newest', 'oldest', 'price').pipe(
      S.optional,
      S.withDefaults({
        constructor: () => 'newest' as const,
        decoding: () => 'newest' as const,
      }),
    ),
  }),
)

export const Route = createFileRoute('/shop/products/')({
  validateSearch: productSearchSchema,
})
```

## Reading Search Params

Once your search params have been validated and typed, you're finally ready to start reading and writing to them. There are a few ways to do this in TanStack Router, so let's check them out.

### Using Search Params in Loaders

Please read the [Search Params in Loaders](../data-loading.md#using-loaderdeps-to-access-search-params) section for more information about how to read search params in loaders with the `loaderDeps` option.

### Search Params are inherited from Parent Routes

The search parameters and types of parents are merged as you go down the route tree, so child routes also have access to their parent's search params:

- `shop.products.tsx`

```tsx
const productSearchSchema = z.object({
  page: z.number().catch(1),
  filter: z.string().catch(''),
  sort: z.enum(['newest', 'oldest', 'price']).catch('newest'),
})

type ProductSearch = z.infer<typeof productSearchSchema>

export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})
```

- `shop.products.$productId.tsx`

```tsx
export const Route = createFileRoute('/shop/products/$productId')({
  beforeLoad: ({ search }) => {
    search
    // ^? ProductSearch ✅
  },
})
```

### Search Params in Components

You can access your route's validated search params in your route's `component` via the `useSearch` hook.

```tsx
// /routes/shop.products.tsx

export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  const { page, filter, sort } = Route.useSearch()

  return <div>...</div>
}
```

> [!TIP]
> If your component is code-split, you can use the [getRouteApi function](../code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to import the `Route` configuration to get access to the typed `useSearch()` hook.

### Search Params outside of Route Components

You can access your route's validated search params anywhere in your app using the `useSearch` hook. By passing the `from` id/path of your origin route, you'll get even better type safety:

```tsx
// /routes/shop.products.tsx
export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
  // ...
})

// Somewhere else...

// /components/product-list-sidebar.tsx
const routeApi = getRouteApi('/shop/products')

const ProductList = () => {
  const routeSearch = routeApi.useSearch()

  // OR

  const { page, filter, sort } = useSearch({
    from: Route.fullPath,
  })

  return <div>...</div>
}
```

Or, you can loosen up the type-safety and get an optional `search` object by passing `strict: false`:

```tsx
function ProductList() {
  const search = useSearch({
    strict: false,
  })
  // {
  //   page: number | undefined
  //   filter: string | undefined
  //   sort: 'newest' | 'oldest' | 'price' | undefined
  // }

  return <div>...</div>
}
```

## Writing Search Params

Now that you've learned how to read your route's search params, you'll be happy to know that you've already seen the primary APIs to modify and update them. Let's remind ourselves a bit

### `<Link search />`

The best way to update search params is to use the `search` prop on the `<Link />` component.

If the search for the current page shall be updated and the `from` prop is specified, the `to` prop can be omitted.  
Here's an example:

```tsx
// /routes/shop.products.tsx
export const Route = createFileRoute('/shop/products')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  return (
    <div>
      <Link from={Route.fullPath} search={(prev) => ({ page: prev.page + 1 })}>
        Next Page
      </Link>
    </div>
  )
}
```

If you want to update the search params in a generic component that is rendered on multiple routes, specifying `from` can be challenging.

In this scenario you can set `to="."` which will give you access to loosely typed search params.  
Here is an example that illustrates this:

```tsx
// `page` is a search param that is defined in the __root route and hence available on all routes.
const PageSelector = () => {
  return (
    <div>
      <Link to="." search={(prev) => ({ ...prev, page: prev.page + 1 })}>
        Next Page
      </Link>
    </div>
  )
}
```

If the generic component is only rendered in a specific subtree of the route tree, you can specify that subtree using `from`. Here you can omit `to='.'` if you want.

```tsx
// `page` is a search param that is defined in the /posts route and hence available on all of its child routes.
const PageSelector = () => {
  return (
    <div>
      <Link
        from="/posts"
        to="."
        search={(prev) => ({ ...prev, page: prev.page + 1 })}
      >
        Next Page
      </Link>
    </div>
  )
```

### `useNavigate(), navigate({ search })`

The `navigate` function also accepts a `search` option that works the same way as the `search` prop on `<Link />`:

```tsx
// /routes/shop.products.tsx
export const Route = createFileRoute('/shop/products/$productId')({
  validateSearch: productSearchSchema,
})

const ProductList = () => {
  const navigate = useNavigate({ from: Route.fullPath })

  return (
    <div>
      <button
        onClick={() => {
          navigate({
            search: (prev) => ({ page: prev.page + 1 }),
          })
        }}
      >
        Next Page
      </button>
    </div>
  )
}
```

### `router.navigate({ search })`

The `router.navigate` function works exactly the same way as the `useNavigate`/`navigate` hook/function above.

### `<Navigate search />`

The `<Navigate search />` component works exactly the same way as the `useNavigate`/`navigate` hook/function above, but accepts its options as props instead of a function argument.

## Transforming search with search middlewares

When link hrefs are built, by default the only thing that matters for the query string part is the `search` property of a `<Link>`.

TanStack Router provides a way to manipulate search params before the href is generated via **search middlewares**.
Search middlewares are functions that transform the search parameters when generating new links for a route or its descendants.
They are also executed upon navigation after search validation to allow manipulation of the query string.

The following example shows how to make sure that for **every** link that is being built, the `rootValue` search param is added _if_ it is part of the current search params. If a link specifies `rootValue` inside `search`, then that value is used for building the link.

```tsx
import { z } from 'zod'
import { createFileRoute } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [
      ({ search, next }) => {
        const result = next(search)
        return {
          rootValue: search.rootValue,
          ...result,
        }
      },
    ],
  },
})
```

Since this specific use case is quite common, TanStack Router provides a generic implementation to retain search params via `retainSearchParams`:

```tsx
import { z } from 'zod'
import { createFileRoute, retainSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const searchSchema = z.object({
  rootValue: z.string().optional(),
})

export const Route = createRootRoute({
  validateSearch: zodValidator(searchSchema),
  search: {
    middlewares: [retainSearchParams(['rootValue'])],
  },
})
```

Another common use case is to strip out search params from links if their default value is set. TanStack Router provides a generic implementation for this use case via `stripSearchParams`:

```tsx
import { z } from 'zod'
import { createFileRoute, stripSearchParams } from '@tanstack/react-router'
import { zodValidator } from '@tanstack/zod-adapter'

const defaultValues = {
  one: 'abc',
  two: 'xyz',
}

const searchSchema = z.object({
  one: z.string().default(defaultValues.one),
  two: z.string().default(defaultValues.two),
})

export const Route = createFileRoute('/hello')({
  validateSearch: zodValidator(searchSchema),
  search: {
    // strip default values
    middlewares: [stripSearchParams(defaultValues)],
  },
})
```

Multiple middlewares can be chained. The following example shows how to combine both `retainSearchParams` and `stripSearchParams`.

```tsx
import {
  Link,
  createFileRoute,
  retainSearchParams,
  stripSearchParams,
} from '@tanstack/react-router'
import { z } from 'zod'
import { zodValidator } from '@tanstack/zod-adapter'

const defaultValues = ['foo', 'bar']

export const Route = createFileRoute('/search')({
  validateSearch: zodValidator(
    z.object({
      retainMe: z.string().optional(),
      arrayWithDefaults: z.string().array().default(defaultValues),
      required: z.string(),
    }),
  ),
  search: {
    middlewares: [
      retainSearchParams(['retainMe']),
      stripSearchParams({ arrayWithDefaults: defaultValues }),
    ],
  },
})
```

# SSR

Server Side Rendering (SSR) is the process of rendering a component on the server and sending the HTML markup to the client. The client then hydrates the markup into a fully interactive component.

There are usually two different flavors of SSR to be considered:

- Non-streaming SSR
  - The entire page is rendered on the server and sent to the client in one single HTML request, including the serialized data the application needs to hydrate on the client.
- Streaming SSR
  - The critical first paint of the page is rendered on the server and sent to the client in one single HTML request, including the serialized data the application needs to hydrate on the client
  - The rest of the page is then streamed to the client as it is rendered on the server.

This guide will explain how to implement both flavors of SSR with TanStack Router!

## Non-Streaming SSR

Non-Streaming server-side rendering is the classic process of rendering the markup for your entire application page on the server and sending the completed HTML markup (and data) to the client. The client then hydrates the markup into a fully interactive application again.

To implement non-streaming SSR with TanStack Router, you will need the following utilities:

- `StartServer` from `@tanstack/react-start/server`
  - e.g. `<StartServer router={router} />`
  - Rendering this component in your server entry will render your application and also automatically handle application-level hydration/dehydration and implement the `Wrap` component option on `Router`
- `StartClient` from `@tanstack/react-start`
  - e.g. `<StartClient router={router} />`
  - Rendering this component in your client entry will render your application and also automatically implement the `Wrap` component option on `Router`

### Router Creation

Since your router will exist both on the server and the client, it's important that you create your router in a way that is consistent between both of these environments. The easiest way to do this is to expose a `createRouter` function in a shared file that can be imported and called by both your server and client entry files.

- `src/router.tsx`

```tsx
import * as React from 'react'
import { createRouter as createTanstackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  return createTanstackRouter({ routeTree })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

Now you can import this function in both your server and client entry files and create your router.

- `src/entry-server.tsx`

```tsx
import { createRouter } from './router'

export async function render(req, res) {
  const router = createRouter()
}
```

- `src/entry-client.tsx`

```tsx
import { createRouter } from './router'

const router = createRouter()
```

### Server History

On the client, Router defaults to using an instance of `createBrowserHistory`, which is the preferred type of history to use on the client. On the server, however, you will want to use an instance of `createMemoryHistory` instead. This is because `createBrowserHistory` uses the `window` object, which does not exist on the server.

> 🧠 Make sure you initialize your memory history with the server URL that is being rendered.

- `src/entry-server.tsx`

```tsx
const router = createRouter()

const memoryHistory = createMemoryHistory({
  initialEntries: [opts.url],
})
```

After creating the memory history instance, you can update the router to use it.

- `src/entry-server.tsx`

```tsx
router.update({
  history: memoryHistory,
})
```

### Loading Critical Router Data on the Server

In order to render your application on the server, you will need to ensure that the router has loaded any critical data via it's route loaders. To do this, you can `await router.load()` before rendering your application. This will quite literally wait for each of the matching route matches found for this url to run their route's `loader` functions in parallel.

- `src/entry-server.tsx`

```tsx
await router.load()
```

## Automatic Loader Dehydration/Hydration

Resolved loader data fetched by routes is automatically dehydrated and rehydrated by TanStack Router so long as you complete the standard SSR steps outlined in this guide.

⚠️ If you are using deferred data streaming, you will also need to ensure that you have implemented the [SSR Streaming & Stream Transform](#streaming-ssr) pattern near the end of this guide.

For more information on how to utilize data loading, see the [Data Loading](../data-loading.md) guide.

### Rendering the Application on the Server

Now that you have a router instance that has loaded all of the critical data for the current URL, you can render your application on the server:

```tsx
// src/entry-server.tsx

const html = ReactDOMServer.renderToString(<StartServer router={router} />)
```

### Handling Not Found Errors

`router` has a method `hasNotFoundMatch` to check if a not-found error has occurred during the rendering process. Use this method to check if a not-found error has occurred and set the response status code accordingly:

```tsx
// src/entry-server.tsx
if (router.hasNotFoundMatch()) statusCode = 404
```

### All Together Now!

Here is a complete example of a server entry file that uses all of the concepts discussed above.

```tsx
// src/entry-server.tsx
import * as React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createMemoryHistory } from '@tanstack/react-router'
import { StartServer } from '@tanstack/react-start/server'
import { createRouter } from './router'

export async function render(url, response) {
  const router = createRouter()

  const memoryHistory = createMemoryHistory({
    initialEntries: [url],
  })

  router.update({
    history: memoryHistory,
  })

  await router.load()

  const appHtml = ReactDOMServer.renderToString(<StartServer router={router} />)

  response.statusCode = router.hasNotFoundMatch() ? 404 : 200
  response.setHeader('Content-Type', 'text/html')
  response.end(`<!DOCTYPE html>${appHtml}`)
}
```

## Rendering the Application on the Client

On the client, things are much simpler.

- Create your router instance
- Render your application using the `<StartClient />` component

```tsx
// src/entry-client.tsx

import * as React from 'react'
import ReactDOM from 'react-dom/client'

import { StartClient } from '@tanstack/react-start'
import { createRouter } from './router'

const router = createRouter()

ReactDOM.hydrateRoot(document, <StartClient router={router} />)
```

With this setup, your application will be rendered on the server and then hydrated on the client!

## Streaming SSR

Streaming SSR is the most modern flavor of SSR and is the process of continuously and incrementally sending HTML markup to the client as it is rendered on the server. This is slightly different from traditional SSR in concept because beyond being able to dehydrate and rehydrate a critical first paint, markup and data with less priority or slower response times can be streamed to the client after the initial render, but in the same request.

This pattern can be useful for pages that have slow or high-latency data fetching requirements. For example, if you have a page that needs to fetch data from a third-party API, you can stream the critical initial markup and data to the client and then stream the less-critical third-party data to the client as it is resolved.

**This streaming pattern is all automatic as long as you are using `renderToPipeableStream`**.

## Streaming Dehydration/Hydration

Streaming dehydration/hydration is an advanced pattern that goes beyond markup and allows you to dehydrate and stream any supporting data from the server to the client and rehydrate it on arrival. This is useful for applications that may need to further use/manage the underlying data that was used to render the initial markup on the server.

## Data Serialization

When using SSR, data passed between the server and the client must be serialized before it is sent across network-boundaries. TanStack Router handles this serialization using a very lightweight serializer that supports common data types beyond JSON.stringify/JSON.parse.

Out of the box, the following types are supported:

- `undefined`
- `Date`
- `Error`
- `FormData`

If you feel that there are other types that should be supported by default, please open an issue on the TanStack Router repository.

If you are using more complex data types like `Map`, `Set`, `BigInt`, etc, you may need to use a custom serializer to ensure that your type-definitions are accurate and your data is correctly serialized and deserialized. We are currently working on both a more robust serializer and a way to customize the serializer for your application. Open an issue if you are interested in helping out!

<!-- This is where the `serializer` option on `createRouter` comes in. -->

The Data Serialization API allows the usage of a custom serializer that can allow us to transparently use these data types when communicating across the network.

<!-- The following example shows usage with [SuperJSON](https://github.com/blitz-js/superjson), however, anything that implements [`Start Serializer`](../../api/router/RouterOptionsType.md#serializer-property) can be used. -->

```tsx
import { SuperJSON } from 'superjson'

const router = createRouter({
  serializer: SuperJSON,
})
```

Just like that, TanStack Router will now appropriately use SuperJSON to serialize data across the network.

# Static Route Data

When creating routes, you can optionally specify a `staticData` property in the route's options. This object can literally contain anything you want as long as it's synchronously available when you create your route.

In addition to being able to access this data from the route itself, you can also access it from any match under the `match.staticData` property.

## Example

- `posts.tsx`

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  staticData: {
    customData: 'Hello!',
  },
})
```

You can then access this data anywhere you have access to your routes, including matches that can be mapped back to their routes.

- `__root.tsx`

```tsx
import { createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: () => {
    const matches = useMatches()

    return (
      <div>
        {matches.map((match) => {
          return <div key={match.id}>{match.staticData.customData}</div>
        })}
      </div>
    )
  },
})
```

## Enforcing Static Data

If you want to enforce that a route has static data, you can use declaration merging to add a type to the route's static option:

```tsx
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    customData: string
  }
}
```

Now, if you try to create a route without the `customData` property, you'll get a type error:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  staticData: {
    // Property 'customData' is missing in type '{ customData: number; }' but required in type 'StaticDataRouteOption'.ts(2741)
  },
})
```

## Optional Static Data

If you want to make static data optional, simply add a `?` to the property:

```tsx
declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    customData?: string
  }
}
```

As long as there are any required properties on the `StaticDataRouteOption`, you'll be required to pass in an object.

# TanStack Start

TanStack Start is a full-stack framework for building server-rendered React applications built on top of [TanStack Router](https://tanstack.com/router).

To set up a TanStack Start project, you'll need to:

1. Install the dependencies
2. Add a configuration file
3. Create required templating

Follow this guide to build a basic TanStack Start web application. Together, we will use TanStack Start to:

- Serve an index page...
- Which displays a counter...
- With a button to increment the counter persistently.

[Here is what that will look like](https://stackblitz.com/github/tanstack/router/tree/main/examples/react/start-basic-counter)

Create a new project if you're starting fresh.

```shell
mkdir myApp
cd myApp
npm init -y
```

Create a `tsconfig.json` file with at least the following settings:

```jsonc
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "Preserve",
    "target": "ES2022",
    "skipLibCheck": true,
  },
}
```

# Install Dependencies

TanStack Start is powered by the following packages and need to be installed as dependencies:

- [@tanstack/start](https://github.com/tanstack/start)
- [@tanstack/react-router](https://tanstack.com/router)
- [Vinxi](https://vinxi.vercel.app/)

> [!NOTE]
> Vinxi is a temporary dependency that will be replaced by a simple vite plugin or a dedicated Start CLI.

To install them, run:

```shell
npm i @tanstack/react-start @tanstack/react-router vinxi
```

You'll also need React and the Vite React plugin, so install their dependencies as well:

```shell
npm i react react-dom @vitejs/plugin-react
```

Please, for you, your fellow developers, and your users' sake, use TypeScript:

```shell
npm i -D typescript @types/react @types/react-dom
```

# Update Configuration Files

We'll then update our `package.json` to use Vinxi's CLI and set `"type": "module"`:

```jsonc
{
  // ...
  "type": "module",
  "scripts": {
    "dev": "vinxi dev",
    "build": "vinxi build",
    "start": "vinxi start",
  },
}
```

Then configure TanStack Start's `app.config.ts` file:

```typescript
// app.config.ts
import { defineConfig } from '@tanstack/react-start/config'

export default defineConfig({})
```

# Add the Basic Templating

There are four required files for TanStack Start usage:

1. The router configuration
2. The server entry point
3. The client entry point
4. The root of your application

Once configuration is done, we'll have a file tree that looks like the following:

```
.
├── app/
│   ├── routes/
│   │   └── `__root.tsx`
│   ├── `client.tsx`
│   ├── `router.tsx`
│   ├── `routeTree.gen.ts`
│   └── `ssr.tsx`
├── `.gitignore`
├── `app.config.ts`
├── `package.json`
└── `tsconfig.json`
```

## The Router Configuration

This is the file that will dictate the behavior of TanStack Router used within Start. Here, you can configure everything
from the default [preloading functionality](../preloading.md) to [caching staleness](../data-loading.md).

```tsx
// app/router.tsx
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createRouter() {
  const router = createTanStackRouter({
    routeTree,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
```

> `routeTree.gen.ts` is not a file you're expected to have at this point.
> It will be generated when you run TanStack Start (via `npm run dev` or `npm run start`) for the first time.

## The Server Entry Point

As TanStack Start is an [SSR](https://unicorn-utterances.com/posts/what-is-ssr-and-ssg) framework, we need to pipe this router
information to our server entry point:

```tsx
// app/ssr.tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { getRouterManifest } from '@tanstack/react-start/router-manifest'

import { createRouter } from './router'

export default createStartHandler({
  createRouter,
  getRouterManifest,
})(defaultStreamHandler)
```

This allows us to know what routes and loaders we need to execute when the user hits a given route.

## The Client Entry Point

Now we need a way to hydrate our client-side JavaScript once the route resolves to the client. We do this by piping the same
router information to our client entry point:

```tsx
// app/client.tsx
import { hydrateRoot } from 'react-dom/client'
import { StartClient } from '@tanstack/react-start'
import { createRouter } from './router'

const router = createRouter({
  scrollRestoration: true,
})

hydrateRoot(document!, <StartClient router={router} />)
```

This enables us to kick off client-side routing once the user's initial server request has fulfilled.

## The Root of Your Application

Finally, we need to create the root of our application. This is the entry point for all other routes. The code in this file will wrap all other routes in the application.

```tsx
// app/routes/__root.tsx
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { Outlet } from '@tanstack/react-router'
import * as React from 'react'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html>
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

# Writing Your First Route

Now that we have the basic templating setup, we can write our first route. This is done by creating a new file in the `app/routes` directory.

```tsx
// app/routes/index.tsx
import * as fs from 'fs'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'

const filePath = 'count.txt'

async function readCount() {
  return parseInt(
    await fs.promises.readFile(filePath, 'utf-8').catch(() => '0'),
  )
}

const getCount = createServerFn({
  method: 'GET',
}).handler(() => {
  return readCount()
})

const updateCount = createServerFn({ method: 'POST' })
  .validator((d: number) => d)
  .handler(async ({ data }) => {
    const count = await readCount()
    await fs.promises.writeFile(filePath, `${count + data}`)
  })

export const Route = createFileRoute('/')({
  component: Home,
  loader: async () => await getCount(),
})

function Home() {
  const router = useRouter()
  const state = Route.useLoaderData()

  return (
    <button
      onClick={() => {
        updateCount({ data: 1 }).then(() => {
          router.invalidate()
        })
      }}
    >
      Add 1 to {state}?
    </button>
  )
}
```

That's it! 🤯 You've now set up a TanStack Start project and written your first route. 🎉

You can now run `npm run dev` to start your server and navigate to `http://localhost:3000` to see your route in action.

# Type Safety

TanStack Router is built to be as type-safe as possible within the limits of the TypeScript compiler and runtime. This means that it's not only written in TypeScript, but that it also **fully infers the types it's provided and tenaciously pipes them through the entire routing experience**.

Ultimately, this means that you write **less types as a developer** and have **more confidence in your code** as it evolves.

## Route Definitions

### File-based Routing

Routes are hierarchical, and so are their definitions. If you're using file-based routing, much of the type-safety is already taken care of for you.

### Code-based Routing

If you're using the `Route` class directly, you'll need to be aware of how to ensure your routes are typed properly using the `Route`'s `getParentRoute` option. This is because child routes need to be aware of **all** of their parent routes types. Without this, those precious search params you parsed out of your _layout_ and _pathless layout_ routes, 3 levels up, would be lost to the JS void.

So, don't forget to pass the parent route to your child routes!

```tsx
const parentRoute = createRoute({
  getParentRoute: () => parentRoute,
})
```

## Exported Hooks, Components, and Utilities

For the types of your router to work with top-level exports like `Link`, `useNavigate`, `useParams`, etc. they must permeate the type-script module boundary and be registered right into the library. To do this, we use declaration merging on the exported `Register` interface.

```ts
const router = createRouter({
  // ...
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

By registering your router with the module, you can now use the exported hooks, components, and utilities with your router's exact types.

## Fixing the Component Context Problem

Component context is a wonderful tool in React and other frameworks for providing dependencies to components. However, if that context is changing types as it moves throughout your component hierarchy, it becomes impossible for TypeScript to know how to infer those changes. To get around this, context-based hooks and components require that you give them a hint on how and where they are being used.

```tsx
export const Route = createFileRoute('/posts')({
  component: PostsComponent,
})

function PostsComponent() {
  // Each route has type-safe versions of most of the built-in hooks from TanStack Router
  const params = Route.useParams()
  const search = Route.useSearch()

  // Some hooks require context from the *entire* router, not just the current route. To achieve type-safety here,
  // we must pass the `from` param to tell the hook our relative position in the route hierarchy.
  const navigate = useNavigate({ from: Route.fullPath })
  // ... etc
}
```

Every hook and component that requires a context hint will have a `from` param where you can pass the ID or path of the route you are rendering within.

> 🧠 Quick tip: If your component is code-split, you can use the [getRouteApi function](../code-splitting.md#manually-accessing-route-apis-in-other-files-with-the-getrouteapi-helper) to avoid having to pass in the `Route.fullPath` to get access to the typed `useParams()` and `useSearch()` hooks.

### What if I don't know the route? What if it's a shared component?

The `from` property is optional, which means if you don't pass it, you'll get the router's best guess on what types will be available. Usually, that means you'll get a union of all of the types of all of the routes in the router.

### What if I pass the wrong `from` path?

It's technically possible to pass a `from` that satisfies TypeScript, but may not match the actual route you are rendering within at runtime. In this case, each hook and component that supports `from` will detect if your expectations don't match the actual route you are rendering within, and will throw a runtime error.

### What if I don't know the route, or it's a shared component, and I can't pass `from`?

If you are rendering a component that is shared across multiple routes, or you are rendering a component that is not within a route, you can pass `strict: false` instead of a `from` option. This will not only silence the runtime error, but will also give you relaxed, but accurate types for the potential hook you are calling. A good example of this is calling `useSearch` from a shared component:

```tsx
function MyComponent() {
  const search = useSearch({ strict: false })
}
```

In this case, the `search` variable will be typed as a union of all possible search params from all routes in the router.

## Router Context

Router context is so extremely useful as it's the ultimate hierarchical dependency injection. You can supply context to the router and to each and every route it renders. As you build up this context, TanStack Router will merge it down with the hierarchy of routes, so that each route has access to the context of all of its parents.

The `createRootRouteWithContext` factory creates a new router with the instantiated type, which then creates a requirement for you to fulfill the same type contract to your router, and will also ensure that your context is properly typed throughout the entire route tree.

```tsx
const rootRoute = createRootRouteWithContext<{ whateverYouWant: true }>()({
  component: App,
})

const routeTree = rootRoute.addChildren([
  // ... all child routes will have access to `whateverYouWant` in their context
])

const router = createRouter({
  routeTree,
  context: {
    // This will be required to be passed now
    whateverYouWant: true,
  },
})
```

## Performance Recommendations

As your application scales, TypeScript check times will naturally increase. There are a few things to keep in mind when your application scales to keep your TS check times down.

### Only infer types you need

A great pattern with client side data caches (TanStack Query, etc.) is to prefetch data. For example with TanStack Query you might have a route which calls `queryClient.ensureQueryData` in a `loader`.

```tsx
export const Route = createFileRoute('/posts/$postId/deep')({
  loader: ({ context: { queryClient }, params: { postId } }) =>
    queryClient.ensureQueryData(postQueryOptions(postId)),
  component: PostDeepComponent,
})

function PostDeepComponent() {
  const params = Route.useParams()
  const data = useSuspenseQuery(postQueryOptions(params.postId))

  return <></>
}
```

This may look fine and for small route trees and you may not notice any TS performance issues. However in this case TS has to infer the loader's return type, despite it never being used in your route. If the loader data is a complex type with many routes that prefetch in this manner, it can slow down editor performance. In this case, the change is quite simple and let typescript infer Promise<void>.

```tsx
export const Route = createFileRoute('/posts/$postId/deep')({
  loader: async ({ context: { queryClient }, params: { postId } }) => {
    await queryClient.ensureQueryData(postQueryOptions(postId))
  },
  component: PostDeepComponent,
})

function PostDeepComponent() {
  const params = Route.useParams()
  const data = useSuspenseQuery(postQueryOptions(params.postId))

  return <></>
}
```

This way the loader data is never inferred and it moves the inference out of the route tree to the first time you use `useSuspenseQuery`.

### Narrow to relevant routes as much as you possibly can

Consider the following usage of `Link`

```tsx
<Link to=".." search={{ page: 0 }} />
<Link to="." search={{ page: 0 }} />
```

**These examples are bad for TS performance**. That's because `search` resolves to a union of all `search` params for all routes and TS has to check whatever you pass to the `search` prop against this potentially big union. As your application grows, this check time will increase linearly to number of routes and search params. We have done our best to optimize for this case (TypeScript will typically do this work once and cache it) but the initial check against this large union is expensive. This also applies to `params` and other API's such as `useSearch`, `useParams`, `useNavigate` etc.

Instead you should try to narrow to relevant routes with `from` or `to`.

```tsx
<Link from={Route.fullPath} to=".." search={{page: 0}} />
<Link from="/posts" to=".." search={{page: 0}} />
```

Remember you can always pass a union to `to` or `from` to narrow the routes you're interested in.

```tsx
const from: '/posts/$postId/deep' | '/posts/' = '/posts/'
<Link from={from} to='..' />
```

You can also pass branches to `from` to only resolve `search` or `params` to be from any descendants of that branch:

```tsx
const from = '/posts'
<Link from={from} to='..' />
```

`/posts` could be a branch with many descendants which share the same `search` or `params`

### Consider using the object syntax of `addChildren`

It's typical of routes to have `params` `search`, `loaders` or `context` that can even reference external dependencies which are also heavy on TS inference. For such applications, using objects for creating the route tree can be more performant than tuples.

`createChildren` also can accept an object. For large route trees with complex routes and external libraries, objects can be much faster for TS to type check as opposed to large tuples. The performance gains depend on your project, what external dependencies you have and how the types for those libraries are written

```tsx
const routeTree = rootRoute.addChildren({
  postsRoute: postsRoute.addChildren({ postRoute, postsIndexRoute }),
  indexRoute,
})
```

Note this syntax is more verbose but has better TS performance. With file based routing, the route tree is generated for you so a verbose route tree is not a concern

### Avoid internal types without narrowing

It's common you might want to re-use types exposed. For example you might be tempted to use `LinkProps` like so

```tsx
const props: LinkProps = {
  to: '/posts/',
}

return (
  <Link {...props}>
)
```

**This is VERY bad for TS Performance**. The problem here is `LinkProps` has no type arguments and is therefore an extremely large type. It includes `search` which is a union of all `search` params, it contains `params` which is a union of all `params`. When merging this object with `Link` it will do a structural comparison of this huge type.

Instead you can use `as const satisfies` to infer a precise type and not `LinkProps` directly to avoid the huge check

```tsx
const props = {
  to: '/posts/',
} as const satisfies LinkProps

return (
  <Link {...props}>
)
```

As `props` is not of type `LinkProps` and therefore this check is cheaper because the type is much more precise. You can also improve type checking further by narrowing `LinkProps`

```tsx
const props = {
  to: '/posts/',
} as const satisfies LinkProps<RegisteredRouter, string '/posts/'>

return (
  <Link {...props}>
)
```

This is even faster as we're checking against the narrowed `LinkProps` type.

You can also use this to narrow the type of `LinkProps` to a specific type to be used as a prop or parameter to a function

```tsx
export const myLinkProps = [
  {
    to: '/posts',
  },
  {
    to: '/posts/$postId',
    params: { postId: 'postId' },
  },
] as const satisfies ReadonlyArray<LinkProps>

export type MyLinkProps = (typeof myLinkProps)[number]

const MyComponent = (props: { linkProps: MyLinkProps }) => {
  return <Link {...props.linkProps} />
}
```

This is faster than using `LinkProps` directly in a component because `MyLinkProps` is a much more precise type

Another solution is not to use `LinkProps` and to provide inversion of control to render a `Link` component narrowed to a specific route. Render props are a good method of inverting control to the user of a component

```tsx
export interface MyComponentProps {
  readonly renderLink: () => React.ReactNode
}

const MyComponent = (props: MyComponentProps) => {
  return <div>{props.renderLink()}</div>
}

const Page = () => {
  return <MyComponent renderLink={() => <Link to="/absolute" />} />
}
```

This particular example is very fast as we've inverted control of where we're navigating to the user of the component. The `Link` is narrowed to the exact route
we want to navigate to

# Type Utilities

Most types exposed by TanStack Router are internal, subject to breaking changes and not always easy to use. That is why TanStack Router has a subset of exposed types focused on ease of use with the intension to be used externally. These types provide the same type safe experience from TanStack Router's runtime concepts on the type level, with flexibility of where to provide type checking

## Type checking Link options with `ValidateLinkOptions`

`ValidateLinkOptions` type checks object literal types to ensure they conform to `Link` options at inference sites. For example, you may have a generic `HeadingLink` component which accepts a `title` prop along with `linkOptions`, the idea being this component can be re-used for any navigation.

```tsx
export interface HeaderLinkProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions = unknown,
> {
  title: string
  linkOptions: ValidateLinkOptions<TRouter, TOptions>
}

export function HeadingLink<TRouter extends RegisteredRouter, TOptions>(
  props: HeaderLinkProps<TRouter, TOptions>,
): React.ReactNode
export function HeadingLink(props: HeaderLinkProps): React.ReactNode {
  return (
    <>
      <h1>{props.title}</h1>
      <Link {...props.linkOptions} />
    </>
  )
}
```

A more permissive overload of `HeadingLink` is used to avoid type assertions you would otherwise have to do with the generic signature. Using a looser signature without type parameters is an easy way to avoid type assertions in the implementation of `HeadingLink`

All type parameters for utilities are optional but for the best TypeScript performance `TRouter` should always be specified for the public facing signature. And `TOptions` should always be used at inference sites like `HeadingLink` to infer the `linkOptions` to correctly narrow `params` and `search`

The result of this is that `linkOptions` in the following is completely type-safe

```tsx
<HeadingLink title="Posts" linkOptions={{ to: '/posts' }} />
<HeadingLink title="Post" linkOptions={{ to: '/posts/$postId', params: {postId: 'postId'} }} />
```

## Type checking an array of Link options with `ValidateLinkOptionsArray`

All navigation type utilities have an array variant. `ValidateLinkOptionsArray` enables type checking of an array of `Link` options. For example, you might have a generic `Menu` component where each item is a `Link`.

```tsx
export interface MenuProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
> {
  items: ValidateLinkOptionsArray<TRouter, TItems>
}

export function Menu<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown>,
>(props: MenuProps<TRouter, TItems>): React.ReactNode
export function Menu(props: MenuProps): React.ReactNode {
  return (
    <ul>
      {props.items.map((item) => (
        <li>
          <Link {...item} />
        </li>
      ))}
    </ul>
  )
}
```

This of course allows the following `items` prop to be completely type-safe

```tsx
<Menu
  items={[
    { to: '/posts' },
    { to: '/posts/$postId', params: { postId: 'postId' } },
  ]}
/>
```

It is also possible to fix `from` for each `Link` options in the array. This would allow all `Menu` items to navigate relative to `from`. Additional type checking of `from` can be provided by the `ValidateFromPath` utility

```tsx
export interface MenuProps<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown> = ReadonlyArray<unknown>,
  TFrom extends string = string,
> {
  from: ValidateFromPath<TRouter, TFrom>
  items: ValidateLinkOptionsArray<TRouter, TItems, TFrom>
}

export function Menu<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TItems extends ReadonlyArray<unknown>,
  TFrom extends string = string,
>(props: MenuProps<TRouter, TItems, TFrom>): React.ReactNode
export function Menu(props: MenuProps): React.ReactNode {
  return (
    <ul>
      {props.items.map((item) => (
        <li>
          <Link {...item} from={props.from} />
        </li>
      ))}
    </ul>
  )
}
```

`ValidateLinkOptionsArray` allows you to fix `from` by providing an extra type parameter. The result is a type safe array of `Link` options providing navigation relative to `from`

```tsx
<Menu
  from="/posts"
  items={[{ to: '.' }, { to: './$postId', params: { postId: 'postId' } }]}
/>
```

## Type checking redirect options with `ValidateRedirectOptions`

`ValidateRedirectOptions` type checks object literal types to ensure they conform to redirect options at inference sites. For example, you may need a generic `fetchOrRedirect` function which accepts a `url` along with `redirectOptions`, the idea being this function will redirect when the `fetch` fails.

```tsx
export async function fetchOrRedirect<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions,
>(
  url: string,
  redirectOptions: ValidateRedirectOptions<TRouter, TOptions>,
): Promise<unknown>
export async function fetchOrRedirect(
  url: string,
  redirectOptions: ValidateRedirectOptions,
): Promise<unknown> {
  const response = await fetch(url)

  if (!response.ok && response.status === 401) {
    throw redirect(redirectOptions)
  }

  return await response.json()
}
```

The result is that `redirectOptions` passed to `fetchOrRedirect` is completely type-safe

```tsx
fetchOrRedirect('http://example.com/', { to: '/login' })
```

## Type checking navigate options with `ValidateNavigateOptions`

`ValidateNavigateOptions` type checks object literal types to ensure they conform to navigate options at inference sites. For example, you may want to write a custom hook to enable/disable navigation.

[//]: # 'TypeCheckingNavigateOptionsWithValidateNavigateOptionsImpl'

```tsx
export interface UseConditionalNavigateResult {
  enable: () => void
  disable: () => void
  navigate: () => void
}

export function useConditionalNavigate<
  TRouter extends RegisteredRouter = RegisteredRouter,
  TOptions,
>(
  navigateOptions: ValidateNavigateOptions<TRouter, TOptions>,
): UseConditionalNavigateResult
export function useConditionalNavigate(
  navigateOptions: ValidateNavigateOptions,
): UseConditionalNavigateResult {
  const [enabled, setEnabled] = useState(false)
  const navigate = useNavigate()
  return {
    enable: () => setEnabled(true),
    disable: () => setEnabled(false),
    navigate: () => {
      if (enabled) {
        navigate(navigateOptions)
      }
    },
  }
}
```

[//]: # 'TypeCheckingNavigateOptionsWithValidateNavigateOptionsImpl'

The result of this is that `navigateOptions` passed to `useConditionalNavigate` is completely type-safe and we can enable/disable navigation based on react state

```tsx
const { enable, disable, navigate } = useConditionalNavigate({
  to: '/posts/$postId',
  params: { postId: 'postId' },
})
```
