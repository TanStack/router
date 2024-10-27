---
title: Navigation
---

## Everything is Relative

Believe it or not, every navigation within an app is **relative**, even if you aren't using explicit relative path syntax (`../../somewhere`). Any time a link is clicked or an imperative navigation call is made, you will always have an **origin** path and a **destination** path which means you are navigating **from** one route **to** another route.

TanStack Router keeps this constant concept of relative navigation in mind for every navigation, so you'll constantly see two properties in the API:

- `from` - The origin route ID
- `to` - The destination route ID

> ⚠️ If a `from` route ID isn't provided the router will assume you are navigating from the root `/` route and only auto-complete absolute paths. After all, you need to know where you are from in order to know where you're going 😉.

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
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
  // A function that returns additional props for the `inactive` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated)
  inactiveProps?:
    | React.AnchorHTMLAttributes<HTMLAnchorElement>
    | (() => React.AnchorHTMLAttributes<HTMLAnchorElement>)
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

  const handleSubmit = async (e: React.FormEvent) => {
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

Occasionally, you may find yourself needing to navigate immediately when a component mounts. Your first instinct might be to reach for `useNavigate` and an immediate side-effect (e.g. React.useEffect), but this is unnecessary. Instead, you can render the `Navigate` component to achieve the same result:

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
