# Overview

**TanStack Router is a router for building React and Solid applications**. Some of its features include:

- 100% inferred TypeScript support
- Typesafe navigation
- Nested Routing and layout routes (with pathless layouts)
- Built-in Route Loaders w/ SWR Caching
- Designed for client-side data caches (TanStack Query, SWR, etc.)
- Automatic route prefetching
- Asynchronous route elements and error boundaries
- File-based Route Generation
- Typesafe JSON-first Search Params state management APIs
- Path and Search Parameter Schema Validation
- Search Param Navigation APIs
- Custom Search Param parser/serializer support
- Search param middleware
- Route matching/loading middleware

To get started quickly, head to the next page. For a more lengthy explanation, buckle up while I bring you up to speed!

## "A Fork in the Route"

Using a router to build applications is widely regarded as a must-have and is usually one of the first choices you’ll make in your tech stack.

[//]: # 'WhyChooseTanStackRouter'

**So, why should you choose TanStack Router over another router?**

To answer this question, we need to look at the other options in the space. There are many if you look hard enough, but in my experience, only a couple are worth exploring seriously:

- **Next.js** - Widely regarded as the de facto framework for starting a new React project, it’s laser focused on performance, workflow, and bleeding edge technology. Its APIs and abstractions are powerful, but can sometimes come across as non-standard. Its extremely fast growth and adoption in the industry has resulted in a featured packed experience, but not at the expense of feeling overwhelming and sometimes bloated.
- **Remix / React Router** - A full-stack framework based on the historically successful React Router offers a similarly powerful developer and user experience, with APIs and vision based firmly on web standards like Request/Response and a focus on running anywhere JS can run. Many of its APIs and abstractions are wonderfully designed and were inspiration for more than a few TanStack Router APIs. That said, its rigid design, bolted-on type safety and sometimes strict over-adherence to platform APIs can leave some developers wanting more.

Both of these frameworks (and their routers) are great, and I can personally attest that both are very good solutions for building React applications. My experience has also taught me that these solutions could also be much better, especially around the actual routing APIs that are available to developers to make their apps faster, easier, and more enjoyable to work with.

It's probably no surprise at this point that picking a router is so important that it is often tied 1-to-1 with your choice of framework, since most frameworks rely on a specific router.

[//]: # 'WhyChooseTanStackRouter'

**Does this mean that TanStack Router is a framework?**

TanStack Router itself is not a "framework" in the traditional sense, since it doesn't address a few other common full-stack concerns. However TanStack Router has been designed to be upgradable to a full-stack framework when used in conjunction with other tools that address bundling, deployments, and server-side-specific functionality. This is why we are currently developing [TanStack Start](https://tanstack.com/start), a full-stack framework that is built on top of TanStack Router and tools like Nitro, and Vite.

For a deeper dive on the history of TanStack Router, feel free to read [TanStack Router's History](../decisions-on-dx.md#tanstack-routers-origin-story).

## Why TanStack Router?

TanStack Router delivers on the same fundamental expectations as other routers that you’ve come to expect:

- Nested routes, layout routes, grouped routes
- File-based Routing
- Parallel data loading
- Prefetching
- URL Path Params
- Error Boundaries and Handling
- SSR
- Route Masking

And it also delivers some new features that raise the bar:

- 100% inferred TypeScript support
- Typesafe navigation
- Built-in SWR Caching for loaders
- Designed for client-side data caches (TanStack Query, SWR, etc.)
- Typesafe JSON-first Search Params state management APIs
- Path and Search Parameter Schema Validation
- Search Parameter Navigation APIs
- Custom Search Param parser/serializer support
- Search param middleware
- Inherited Route Context
- Mixed file-based and code-based routing

Let’s dive into some of the more important ones in more detail!

## 100% Inferred TypeScript Support

Everything these days is written “in Typescript” or at the very least offers type definitions that are veneered over runtime functionality, but too few packages in the ecosystem actually design their APIs with TypeScript in mind. So while I’m pleased that your router is auto-completing your option fields and catching a few property/method typos here and there, there is much more to be had.

- TanStack Router is fully aware of all of your routes and their configuration at any given point in your code. This includes the path, path params, search params, context, and any other configuration you’ve provided. Ultimately this means that you can navigate to any route in your app with 100% type safety and confidence that your link or navigate call will succeed.
- TanStack Router provides lossless type-inference. It uses countless generic type parameters to enforce and propagate any type information you give it throughout the rest of its API and ultimately your app. No other router offers this level of type safety and developer confidence.

What does all of that mean for you?

- Faster feature development with auto-completion and type hints
- Safer and faster refactors
- Confidence that your code will work as expected

## 1st Class Search Parameters

Search parameters are often an afterthought, treated like a black box of strings (or string) that you can parse and update, but not much else. Existing solutions are **not** type-safe either, adding to the caution that is required to deal with them. Even the most "modern" frameworks and routers and leave it up to you to figure out how to manage this state. Sometimes they'll parse the search string into an object for you, or sometimes you're left to do it yourself with `URLSearchParams`.

Let's step back and remember that **search params are the most powerful state manager in your entire application.** They are global, serializable, bookmarkable, and shareable making them the perfect place to store any kind of state that needs to survive a page refresh or a social share.

To live up to that responsibility, search parameters are a first-class citizen in TanStack Router. While still based on standard URLSearchParams, TanStack Router uses a powerful parser/serializer to manage deeper and more complex data structures in your search params, all while keeping them type-safe and easy to work with.

**It's like having `useState` right in the URL!**

Search parameters are:

- Automatically parsed and serialized as JSON
- Validated and typed
- Inherited from parent routes
- Accessible in loaders, components, and hooks
- Easily modified with the useSearch hook, Link, navigate, and router.navigate APIs
- Customizable with a custom search filters and middleware
- Subscribed via fine-grained search param selectors for efficient re-renders

Once you start using TanStack Router's search parameters, you'll wonder how you ever lived without them.

## Built-In Caching and Friendly Data Loading

Data loading is a critical part of any application and while most existing routers offer some form of critical data loading APIs, they often fall short when it comes to caching and data lifecycle management. Existing solutions suffer from a few common problems:

- No caching at all. Data is always fresh, but your users are left waiting for frequently accessed data to load over and over again.
- Overly-aggressive caching. Data is cached for too long, leading to stale data and a poor user experience.
- Blunt invalidation strategies and APIs. Data may be invalidated too often, leading to unnecessary network requests and wasted resources, or you may not have any fine-grained control over when data is invalidated at all.

TanStack Router solves these problems with a two-prong approach to caching and data loading:

### Built-in Cache

TanStack Router provides a light-weight built-in caching layer that works seamlessly with the Router. This caching layer is loosely based on TanStack Query, but with fewer features and a much smaller API surface area. Like TanStack Query, sane but powerful defaults guarantee that your data is cached for reuse, invalidated when necessary, and garbage collected when not in use. It also provides a simple API for invalidating the cache manually when needed.

### Flexible & Powerful Data Lifecycle APIs

TanStack Router is designed with a flexible and powerful data loading API that more easily integrates with existing data fetching libraries like TanStack Query, SWR, Apollo, Relay, or even your own custom data fetching solution. Configurable APIs like `context`, `beforeLoad`, `loaderDeps` and `loader` work in unison to make it easy to define declarative data dependencies, prefetch data, and manage the lifecycle of an external data source with ease.

## Inherited Route Context

TanStack Router's router and route context is a powerful feature that allows you to define context that is specific to a route which is then inherited by all child routes. Even the router and root routes themselves can provide context. Context can be built up both synchronously and asynchronously, and can be used to share data, configuration, or even functions between routes and route configurations. This is especially useful for scenarios like:

- Authentication and Authorization
- Hybrid SSR/CSR data fetching and preloading
- Theming
- Singletons and global utilities
- Curried or partial application across preloading, loading, and rendering stages

Also, what would route context be if it weren't type-safe? TanStack Router's route context is fully type-safe and inferred at zero cost to you.

## File-based and/or Code-Based Routing

TanStack Router supports both file-based and code-based routing at the same time. This flexibility allows you to choose the approach that best fits your project's needs.

TanStack Router's file-based routing approach is uniquely user-facing. Route configuration is generated for you either by the Vite plugin or TanStack Router CLI, leaving the usage of said generated code up to you! This means that you're always in total control of your routes and router, even if you use file-based routing.

## Acknowledgements

TanStack Router builds on concepts and patterns popularized by many other OSS projects, including:

- [TRPC](https://trpc.io/)
- [Remix](https://remix.run)
- [Chicane](https://swan-io.github.io/chicane/)
- [Next.js](https://nextjs.org)

We acknowledge the investment, risk and research that went into their development, but are excited to push the bar they have set even higher.

## Let's go!

Enough overview, there's so much more to do with TanStack Router. Hit that next button and let's get started!

# Quick Start

If you're feeling impatient and prefer to skip all of our wonderful documentation, here is the bare minimum to get going with TanStack Router using both file-based route generation and code-based route configuration:

## Using File-Based Route Generation

File based route generation (through Vite, and other supported bundlers) is the recommended way to use TanStack Router as it provides the best experience, performance, and ergonomics for the least amount of effort.

### Scaffolding Your First TanStack Router Project

```sh
npx create-tsrouter-app@latest my-app --template file-router
```

See [create-tsrouter-app](https://github.com/TanStack/create-tsrouter-app/tree/main/cli/create-tsrouter-app) for more options.

### Manual Setup

Alternatively, you can manually setup the project using the following steps:

#### Install TanStack Router, Vite Plugin, and the Router Devtools

```sh
npm install @tanstack/react-router @tanstack/react-router-devtools
npm install -D @tanstack/router-plugin
# or
pnpm add @tanstack/react-router @tanstack/react-router-devtools
pnpm add -D @tanstack/router-plugin
# or
yarn add @tanstack/react-router @tanstack/react-router-devtools
yarn add -D @tanstack/router-plugin
# or
bun add @tanstack/react-router @tanstack/react-router-devtools
bun add -D @tanstack/router-plugin
# or
deno add npm:@tanstack/react-router npm:@tanstack/router-plugin npm:@tanstack/react-router-devtools
```

#### Configure the Vite Plugin

```tsx
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    // ...,
  ],
})
```

> [!TIP]
> If you are not using Vite, or any of the supported bundlers, you can check out the [TanStack Router CLI](../routing/installation-with-router-cli.md) guide for more info.

Create the following files:

- `src/routes/__root.tsx` (with two '`_`' characters)
- `src/routes/index.tsx`
- `src/routes/about.tsx`
- `src/main.tsx`

#### `src/routes/__root.tsx`

```tsx
import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

export const Route = createRootRoute({
  component: () => (
    <>
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})
```

#### `src/routes/index.tsx`

```tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/')({
  component: Index,
})

function Index() {
  return (
    <div className="p-2">
      <h3>Welcome Home!</h3>
    </div>
  )
}
```

#### `src/routes/about.tsx`

```tsx
import { createLazyFileRoute } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/about')({
  component: About,
})

function About() {
  return <div className="p-2">Hello from About!</div>
}
```

#### `src/main.tsx`

Regardless of whether you are using the `@tanstack/router-plugin` package and running the `npm run dev`/`npm run build` scripts, or manually running the `tsr watch`/`tsr generate` commands from your package scripts, the route tree file will be generated at `src/routeTree.gen.ts`.

Import the generated route tree and create a new router instance:

```tsx
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
```

If you are working with this pattern you should change the `id` of the root `<div>` on your `index.html` file to `<div id='root'></div>`

## Using Code-Based Route Configuration

> [!IMPORTANT]
> The following example shows how to configure routes using code, and for simplicity's sake is in a single file for this demo. While code-based generation allows you to declare many routes and even the router instance in a single file, we recommend splitting your routes into separate files for better organization and performance as your application grows.

```tsx
import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  Link,
  createRouter,
  createRoute,
  createRootRoute,
} from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

const rootRoute = createRootRoute({
  component: () => (
    <>
      <div className="p-2 flex gap-2">
        <Link to="/" className="[&.active]:font-bold">
          Home
        </Link>{' '}
        <Link to="/about" className="[&.active]:font-bold">
          About
        </Link>
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Index() {
    return (
      <div className="p-2">
        <h3>Welcome Home!</h3>
      </div>
    )
  },
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/about',
  component: function About() {
    return <div className="p-2">Hello from About!</div>
  },
})

const routeTree = rootRoute.addChildren([indexRoute, aboutRoute])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const rootElement = document.getElementById('app')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}
```

If you glossed over these examples or didn't understand something, we don't blame you, because there's so much more to learn to really take advantage of TanStack Router! Let's move on.

# Devtools

> Link, take this sword... I mean Devtools!... to help you on your way!

Wave your hands in the air and shout hooray because TanStack Router comes with dedicated devtools! 🥳

When you begin your TanStack Router journey, you'll want these devtools by your side. They help visualize all of the inner workings of TanStack Router and will likely save you hours of debugging if you find yourself in a pinch!

## Installation

The devtools are a separate package that you need to install:

```sh
npm install @tanstack/react-router-devtools
```

or

```sh
pnpm add @tanstack/react-router-devtools
```

or

```sh
yarn add @tanstack/react-router-devtools
```

or

```sh
bun add @tanstack/react-router-devtools
```

## Import the Devtools

```js
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
```

## Using Devtools in production

The Devtools, if imported as `TanStackRouterDevtools` will not be shown in production. If you want to have devtools in an environment with `process.env.NODE_ENV === 'production'`, use instead `TanStackRouterDevtoolsInProd`, which has all the same options:

```tsx
import { TanStackRouterDevtoolsInProd } from '@tanstack/react-router-devtools'
```

## Using inside of the `RouterProvider`

The easiest way for the devtools to work is to render them inside of your root route (or any other route). This will automatically connect the devtools to the router instance.

```tsx
const rootRoute = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const routeTree = rootRoute.addChildren([
  // ... other routes
])

const router = createRouter({
  routeTree,
})

function App() {
  return <RouterProvider router={router} />
}
```

## Manually passing the Router Instance

If rendering the devtools inside of the `RouterProvider` isn't your cup of tea, a `router` prop for the devtools accepts the same `router` instance you pass to the `Router` component. This makes it possible to place the devtools anywhere on the page, not just inside the provider:

```tsx
function App() {
  return (
    <>
      <RouterProvider router={router} />
      <TanStackRouterDevtools router={router} />
    </>
  )
}
```

## Floating Mode

Floating Mode will mount the devtools as a fixed, floating element in your app and provide a toggle in the corner of the screen to show and hide the devtools. This toggle state will be stored and remembered in localStorage across reloads.

Place the following code as high in your React app as you can. The closer it is to the root of the page, the better it will work!

```js
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'

function App() {
  return (
    <>
      <Router />
      <TanStackRouterDevtools initialIsOpen={false} />
    </>
  )
}
```

## Fixed Mode

To control the position of the devtools, import the `TanStackRouterDevtoolsPanel`:

```js
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
```

It can then be attached to provided shadow DOM target:

```js
<TanStackRouterDevtoolsPanel
  shadowDOMTarget={shadowContainer}
  router={router}
/>
```

Click [here](https://tanstack.com/router/latest/docs/framework/react/examples/basic-devtools-panel) to see a live example of this in StackBlitz.

### Options

- `router: Router`
  - The router instance to connect to
- `initialIsOpen: Boolean`
  - Set this `true` if you want the devtools to default to being open
- `panelProps: PropsObject`
  - Use this to add props to the panel. For example, you can add `className`, `style` (merge and override default style), etc.
- `closeButtonProps: PropsObject`
  - Use this to add props to the close button. For example, you can add `className`, `style` (merge and override default style), `onClick` (extend default handler), etc.
- `toggleButtonProps: PropsObject`
  - Use this to add props to the toggle button. For example, you can add `className`, `style` (merge and override default style), `onClick` (extend default handler), etc.
- `position?: "top-left" | "top-right" | "bottom-left" | "bottom-right"`
  - Defaults to `bottom-left`
  - The position of the TanStack Router logo to open and close the devtools panel
- `shadowDOMTarget?: ShadowRoot`
  - Specifies a Shadow DOM target for the devtools.
  - By default, devtool styles are applied to the `<head>` tag of the main document (light DOM). When a `shadowDOMTarget` is provided, styles will be applied within this Shadow DOM instead.

## Embedded Mode

Embedded Mode will embed the devtools as a regular component in your application. You can style it however you'd like after that!

```js
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'

function App() {
  return (
    <>
      <Router router={router} />
      <TanStackRouterDevtoolsPanel
        router={router}
        style={styles}
        className={className}
      />
    </>
  )
}
```

### Options

Use these options to style the devtools.

- `style: StyleObject`
  - The standard React style object used to style a component with inline styles
- `className: string`
  - The standard React className property used to style a component with classes

# Migration from React Router Checklist

**_If your UI is blank, open the console, and you will probably have some errors that read something along the lines of `cannot use 'useNavigate' outside of context` . This means there are React Router api’s that are still imported and referenced that you need to find and remove. The easiest way to make sure you find all React Router imports is to uninstall `react-router-dom` and then you should get typescript errors in your files. Then you will know what to change to a `@tanstack/react-router` import._**

Here is the [example repo](https://github.com/Benanna2019/SickFitsForEveryone/tree/migrate-to-tanstack/router/React-Router)

- [ ] Install Router - `npm i @tanstack/react-router`
- [ ] **Optional:** Uninstall React Router to get TypeScript errors on imports.
  - At this point I don’t know if you can do a gradual migration, but it seems likely you could have multiple router providers, not desirable.
  - The api’s between React Router and TanStack Router are very similar and could most likely be handled in a sprint cycle or two if that is your companies way of doing things.
- [ ] Create Routes for each existing React Router route we have
- [ ] Create root route
- [ ] Create router instance
- [ ] Add global module in main.tsx
- [ ] Remove any React Router (`createBrowserRouter` or `BrowserRouter`), `Routes`, and `Route` Components from main.tsx
- [ ] **Optional:** Refactor `render` function for custom setup/providers - The repo referenced above has an example - This was necessary in the case of Supertokens. Supertoken has a specific setup with React Router and a different setup with all other React implementations
- [ ] Set RouterProvider and pass it the router as the prop
- [ ] Replace all instances of React Router `Link` component with `@tanstack/react-router` `Link` component
  - [ ] Add `to` prop with literal path
  - [ ] Add `params` prop, where necessary with params like so `params={{ orderId: order.id }}`
- [ ] Replace all instances of React Router `useNavigate` hook with `@tanstack/react-router` `useNavigate` hook
  - [ ] Set `to` property and `params` property where needed
- [ ] Replace any React Router `Outlet`'s with the `@tanstack/react-router` equivalent
- [ ] If you are using `useSearchParams` hook from React Router, move the search params default value to the validateSearch property on a Route definition.
  - [ ] Instead of using the `useSearchParams` hook, use `@tanstack/react-router` `Link`'s search property to update the search params state
  - [ ] To read search params you can do something like the following
    - `const { page } = useSearch({ from: productPage.fullPath })`
- [ ] If using React Router’s `useParams` hook, update the import to be from `@tanstack/react-router` and set the `from` property to the literal path name where you want to read the params object from
  - So say we have a route with the path name `orders/$orderid`.
  - In the `useParams` hook we would set up our hook like so: `const params = useParams({ from: "/orders/$orderId" })`
  - Then wherever we wanted to access the order id we would get it off of the params object `params.orderId`

# Migration from React Location

Before you begin your journey in migrating from React Location, it's important that you have a good understanding of the [Routing Concepts](../routing/routing-concepts.md) and [Design Decisions](../decisions-on-dx.md) used by TanStack Router.

## Differences between React Location and TanStack Router

React Location and TanStack Router share much of same design decisions concepts, but there are some key differences that you should be aware of.

- React Location uses _generics_ to infer types for routes, while TanStack Router uses _module declaration merging_ to infer types.
- Route configuration in React Location is done using a single array of route definitions, while in TanStack Router, route configuration is done using a tree of route definitions starting with the [root route](../routing/routing-concepts.md#the-root-route).
- [File-based routing](../routing/file-based-routing.md) is the recommended way to define routes in TanStack Router, while React Location only allows you to define routes in a single file using a code-based approach.
  - TanStack Router does support a [code-based approach](../routing/code-based-routing.md) to defining routes, but it is not recommended for most use cases. You can read more about why, over here: [why is file-based routing the preferred way to define routes?](../decisions-on-dx.md#3-why-is-file-based-routing-the-preferred-way-to-define-routes)

## Migration guide

In this guide we'll go over the process of migrating the [React Location Basic example](https://github.com/TanStack/router/tree/react-location/examples/basic) over to TanStack Router using file-based routing, with the end goal of having the same functionality as the original example (styling and other non-routing related code will be omitted).

> [!TIP]
> To use a code-based approach for defining your routes, you can read the [code-based Routing](../routing/code-based-routing.md) guide.

### Step 1: Swap over to TanStack Router's dependencies

First, we need to install the dependencies for TanStack Router.

```sh
npm install @tanstack/react-router @tanstack/router-devtools
```

And remove the React Location dependencies.

```sh
npm uninstall @tanstack/react-location @tanstack/react-location-devtools
```

### Step 2: Use the file-based routing watcher

If your project uses Vite (or one of the supported bundlers), you can use the TanStack Router plugin to watch for changes in your routes files and automatically update the routes configuration.

Installation of the Vite plugin:

```sh
npm install -D @tanstack/router-plugin
```

And add it to your `vite.config.js`:

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  // ...
  plugins: [TanStackRouterVite(), react()],
})
```

However, if your application does not use Vite, you use one of our other [supported bundlers](../routing/file-based-routing.md#getting-started-with-file-based-routing), or you can use the `@tanstack/router-cli` package to watch for changes in your routes files and automatically update the routes configuration.

### Step 3: Add the file-based configuration file to your project

Create a `tsr.config.json` file in the root of your project with the following content:

```json
{
  "routesDirectory": "./src/routes",
  "generatedRouteTree": "./src/routeTree.gen.ts"
}
```

You can find the full list of options for the `tsr.config.json` file [here](../routing/file-based-routing.md#options).

### Step 4: Create the routes directory

Create a `routes` directory in the `src` directory of your project.

```sh
mkdir src/routes
```

### Step 5: Create the root route file

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/router-devtools'

export const Route = createRootRoute({
  component: () => {
    return (
      <>
        <div>
          <Link to="/" activeOptions={{ exact: true }}>
            Home
          </Link>
          <Link to="/posts">Posts</Link>
        </div>
        <hr />
        <Outlet />
        <TanStackRouterDevtools />
      </>
    )
  },
})
```

### Step 6: Create the index route file

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Index,
})
```

> You will need to move any related components and logic needed for the index route from the `src/index.tsx` file to the `src/routes/index.tsx` file.

### Step 7: Create the posts route file

```tsx
// src/routes/posts.tsx
import { createFileRoute, Link, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  component: Posts,
  loader: async () => {
    const posts = await fetchPosts()
    return {
      posts,
    }
  },
})

function Posts() {
  const { posts } = Route.useLoaderData()
  return (
    <div>
      <nav>
        {posts.map((post) => (
          <Link
            key={post.id}
            to={`/posts/$postId`}
            params={{ postId: post.id }}
          >
            {post.title}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
```

> You will need to move any related components and logic needed for the posts route from the `src/index.tsx` file to the `src/routes/posts.tsx` file.

### Step 8: Create the posts index route file

```tsx
// src/routes/posts.index.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/')({
  component: PostsIndex,
})
```

> You will need to move any related components and logic needed for the posts index route from the `src/index.tsx` file to the `src/routes/posts.index.tsx` file.

### Step 9: Create the posts id route file

```tsx
// src/routes/posts.$postId.tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/posts/$postId')({
  component: PostsId,
  loader: async ({ params: { postId } }) => {
    const post = await fetchPost(postId)
    return {
      post,
    }
  },
})

function PostsId() {
  const { post } = Route.useLoaderData()
  // ...
}
```

> You will need to move any related components and logic needed for the posts id route from the `src/index.tsx` file to the `src/routes/posts.$postId.tsx` file.

### Step 10: Generate the route tree

If you are using one of the supported bundlers, the route tree will be generated automatically when you run the dev script.

If you are not using one of the supported bundlers, you can generate the route tree by running the following command:

```sh
npx tsr generate
```

### Step 11: Update the main entry file to render the Router

Once you've generated the route-tree, you can then update the `src/index.tsx` file to create the router instance and render it.

```tsx
// src/index.tsx
import React from 'react'
import ReactDOM from 'react-dom'
import { createRouter, RouterProvider } from '@tanstack/react-router'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const domElementId = 'root' // Assuming you have a root element with the id 'root'

// Render the app
const rootElement = document.getElementById(domElementId)
if (!rootElement) {
  throw new Error(`Element with id ${domElementId} not found`)
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
)
```

### Finished!

You should now have successfully migrated your application from React Location to TanStack Router using file-based routing.

React Location also has a few more features that you might be using in your application. Here are some guides to help you migrate those features:

- [Search params](../guide/search-params.md)
- [Data loading](../guide/data-loading.md)
- [History types](../guide/history-types.md)
- [Wildcard / Splat / Catch-all routes](../routing/routing-concepts.md#splat--catch-all-routes)
- [Authenticated routes](../guide/authenticated-routes.md)

TanStack Router also has a few more features that you might want to explore:

- [Router Context](../guide/router-context.md)
- [Preloading](../guide/preloading.md)
- [Pathless Layout Routes](../routing/routing-concepts.md#pathless-layout-routes)
- [Route masking](../guide/route-masking.md)
- [SSR](../guide/ssr.md)
- ... and more!

If you are facing any issues or have any questions, feel free to ask for help in the TanStack Discord.

# Frequently Asked Questions

Welcome to the TanStack Router FAQ! Here you'll find answers to common questions about the TanStack Router. If you have a question that isn't answered here, please feel free to ask in the [TanStack Discord](https://tlinz.com/discord).

## Should I commit my `routeTree.gen.ts` file into git?

Yes! Although the route tree file (i.e. `routeTree.gen.ts`) is generated by the TanStack Router, it is essentially towards the runtime of your application. It is not a build artifact. The route tree file is a critical part of your application's source code, and it is used by the TanStack Router to build your application's routes at runtime.

You should commit this file into git so that other developers can use it to build your application.

## Can I conditionally render the Root Route component?

No, the root route is always rendered as it is the entry point of your application.

If you need to conditionally render a route's component, this usually means that the page content needs to be different based on some condition (e.g. user authentication). For this use case, you should use a [Layout Route](../routing/routing-concepts.md#layout-routes) or a [Pathless Layout Route](../routing/routing-concepts.md#pathless-layout-routes) to conditionally render the content.

You can restrict access to these routes using a conditional check in the `beforeLoad` function of the route.

<details>
<summary>What does this look like?</summary>

```tsx
// src/routes/_pathless-layout.tsx
import { createFileRoute, Outlet } from '@tanstack/react-router'
import { isAuthenticated } from '../utils/auth'

export const Route = createFileRoute('/_pathless-layout', {
  beforeLoad: async () => {
    // Check if the user is authenticated
    const authed = await isAuthenticated()
    if (!authed) {
      // Redirect the user to the login page
      return '/login'
    }
  },
  component: PathlessLayoutRouteComponent,
  // ...
})

function PathlessLayoutRouteComponent() {
  return (
    <div>
      <h1>You are authed</h1>
      <Outlet />
    </div>
  )
}
```

</details>

