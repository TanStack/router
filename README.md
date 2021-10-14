<img src="https://static.scarf.sh/a.png?x-pxid=d988eb79-b0fc-4a2b-8514-6a1ab932d188" />

# ⚛️ React-Location (Beta)

Enterprise Routing for React

<a href="https://twitter.com/intent/tweet?button_hashtag=TanStack" target="\_parent">
  <img alt="#TanStack" src="https://img.shields.io/twitter/url?color=%2308a0e9&label=%23TanStack&style=social&url=https%3A%2F%2Ftwitter.com%2Fintent%2Ftweet%3Fbutton_hashtag%3DTanStack">
</a><a href="https://github.com/tannerlinsley/react-location/actions?query=workflow%3A%22react-location+tests%22">
<img src="https://github.com/tannerlinsley/react-location/workflows/react-location%20tests/badge.svg" />
</a><a href="https://npmjs.com/package/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/react-location.svg" />
</a><a href="https://bundlephobia.com/result?p=react-location@next" target="\_parent">
  <img alt="" src="https://badgen.net/bundlephobia/minzip/react-location@next" />
</a><a href="#badge">
    <img alt="semantic-release" src="https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg">
  </a><a href="https://github.com/tannerlinsley/react-location/discussions">
  <img alt="Join the discussion on Github" src="https://img.shields.io/badge/Github%20Discussions%20%26%20Support-Chat%20now!-blue" />
</a><a href="https://bestofjs.org/projects/react-location"><img alt="Best of JS" src="https://img.shields.io/endpoint?url=https://bestofjs-serverless.now.sh/api/project-badge?fullName=tannerlinsley%2Freact-location%26since=daily" /></a><a href="https://github.com/tannerlinsley/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/github/stars/tannerlinsley/react-location.svg?style=social&label=Star" />
</a><a href="https://twitter.com/tannerlinsley" target="\_parent">
  <img alt="" src="https://img.shields.io/twitter/follow/tannerlinsley.svg?style=social&label=Follow" />
</a>

Enjoy this library? Try the entire [TanStack](https://tanstack.com)! [React Query](https://github.com/tannerlinsley/react-query), [React Table](https://github.com/tannerlinsley/react-table), [React Form](https://github.com/tannerlinsley/react-form), [React Charts](https://github.com/tannerlinsley/react-charts)

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Intro](#intro)
  - [URL Search/Query State](#url-searchquery-state)
  - [Deep-Route Suspense & Navigational Transactions](#deep-route-suspense--navigational-transactions)
  - [But Tanner, why didn't you just PR/plugin/proxy/add this functionality into an existing router?](#but-tanner-why-didnt-you-just-prpluginproxyadd-this-functionality-into-an-existing-router)
- [Features](#features)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
  - [ReactLocation](#reactlocation)
  - [ReactLocationProvider](#reactlocationprovider)
  - [Routes](#routes)
  - [useRoutes](#useroutes)
  - [useRoute](#useroute)
  - [Link](#link)
  - [Navigate](#navigate)
  - [useNavigate](#usenavigate)
  - [useMatch](#usematch)
  - [SSR](#ssr)
  - [Inspiration](#inspiration)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Intro

React Location started as a solution to small roadblocks I experienced in the mostly wonderful APIs of [React Router](https://reactrouter.com/) and the [Next.js Router](https://nextjs.org/docs/api-reference/next/router).

### URL Search/Query State

Most applications, even large ones will get away with requiring only a few string-based search query params in the url, probably something like `?page=3` or `?filter-name=tanner`. The main reason you'll find this **state** inside of the URL is because it's linkability and shareability is very important. Your users should be able to bookmark/copy-paste/share a link from your app and have consistency with the original state of the page.

When you begin to store more state in the URL you will inevitably and naturally want to reach for JSON to store it. Storing JSON state in the URL has it's own complications involving:

- Parsing/Serialization
- Immutability & Structural Sharing
- Compression & Readablity
- Powerful Declarative & Imperative APIs to manipulate query state

React Location handles all of this out of the box.

### Deep-Route Suspense & Navigational Transactions

Popularized by frameworks like [Next.js](https://nextjs.org) and [Remix](https://remix.run), **specifying asynchronous dependencies for routes that can all resolve in parallel before rendering** has become an expectation of almost every SSR-based routing APIs. I believe this capability, while intuitive in an SSR environment, is not exclusive to it and definitely has a place in the client-side only world.

React Location provides first-class support for specifying arbitrary asynchronous dependencies for your routes and will asynchronously suspend navigation rendering until these dependencies are met.

Don't like the initial fallback showing on the client while mouting? React Location provides the ability to both:

- Match and pre-load route data during SSR and also
- Supply pre-loaded route data during rehydration

### But Tanner, why didn't you just PR/plugin/proxy/add this functionality into an existing router?

I tried so hard, I promise! I gave my best and most fervent attempt to proxy React Router v6 (argubly the only worthy router in the ecosystem to try this with) to achieve these features, but after hitting the ceiling on its public API and quite literally proxying and re-exporting every single function/variable/type from the library, I realized that unless the core internals of React Router were exposed (which would require yet another breaking change on its part) the idea was dead on arrival. Only then, did I know it was time to design a new router from the ground up with support for the features I needed.

## Features

- Deeply integrated URL Search API ()
  - JSON
  - Immutable w/ Structural Sharing
  - Compression
  - Types
- Deep-Route Loaders (for data, images, assets, readiness, etc.)
- Asynchronous Routes (module-splitting, dynamic routes)

## Quick Start

1. Install `react-location@next`

```sh
npm install react-location@next --save
# or
yarn add react-location@next
```

2. Import and use `react-location`

```tsx
import { React } from 'react'
import { ReactLocation, Routes, Link, useRoute } from 'react-location'

export function App() {
  return (
    <ReactLocation>
      <nav>
        <Link to="/">Home</Link>
        <Link to="dashboard">Dashboard</Link>
        <Link to="invoices">Invoices</Link>
        {/* React Location doesn't handle external links ;) */}
        <a href="https://github.com/tannerlinsley/react-location">
          Github - React Location
        </a>
      </nav>
      <div>
        <Routes
          routes={[
            {
              path: '/',
              element: <Home />,
            },
            {
              path: 'dashboard',
              element: <Dashboard />,
            },
            {
              path: 'invoices',
              element: <Invoices />, // Renders our Invoices Wrapper
              // Load invoices before rendering
              load: async () => ({
                invoices: await fetchInvoices(),
              }),
              children: [
                {
                  path: 'new',
                  element: <NewInvoice />,
                },
                {
                  path: ':invoiceId',
                  element: <Invoice />,
                  // Load the individual invoice before rendering
                  load: async ({ params }) => ({
                    invoice: await fetchInvoiceById(params.invoiceId),
                  }),
                },
              ],
            },
          ]}
        />
      </div>
    </ReactLocation>
  )
}

function Home() {
  return <div>This is Home</div>
}

function Dashboard() {
  return <div>This is the Dashboard</div>
}

function Invoices() {
  const {
    data: { invoices },
  } = useRoute()

  return (
    <>
      <div>Invoices</div>
      <ul>
        <li>
          <Link to="new">New Invoice</Link>
        </li>
        {invoices.map(invoice => {
          return (
            <li key={invoice.id}>
              <Link to={invoice.id}>{invoice.id}</Link>
            </li>
          )
        })}
      </ul>

      <Outlet />
    </>
  )
}

function NewInvoice() {
  return (
    <>
      <Link to="..">Back</Link>
      <div>This is a new invoice!</div>
    </>
  )
}

function Invoice() {
  // Route Info
  const {
    data: { invoice },
  } = useRoute()

  // Search
  const search = useSearch<{
    view?: { expanded?: boolean; isOpen?: boolean }
  }>()

  // Programmatic Navigation
  const navigate = useNavigate()

  const isOpen = search.view?.isOpen

  const togglePreview = () =>
    navigate({
      // Functional updates to search params
      search: old => ({
        ...old,
        view: {
          ...(old.view ?? {}),
          isOpen: !old.view.isOpen,
        },
      }),
    })

  return (
    <div>
      <Link to="..">Back</Link>
      <div>Invoice: #{invoice.id}</div>
      <div>
        <button onClick={togglePreview}>
          {isOpen ? 'Hide' : 'Show'} Preview
        </button>
      </div>
      {isOpen ? <div>This is a preview!</div> : null}
    </div>
  )
}
```

## Documentation

### ReactLocation

**Required: true**

The `ReactLocation` class is the core engine to React Location. It bridges all of the hooks, components and public API to the underlying history and location APIs. It is required and needs to be provided to your application via the `ReactLocationProvider` component.

| Property | Required | Default                                                  | Description                                                                  |
| -------- | -------- | -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| history  | false    | A history will be created automatically if not provided. | The history object to be used internally by react-location                   |
| basepath | false    | `/`                                                      | The basepath prefix for all URLs (not-supported for memory source histories) |

**Example: Basic**

```tsx
import { ReactLocation } from 'react-location'

const reactLocation = new ReactLocation()
```

**Example: Memory History**

```tsx
import { createMemoryHistory, ReactLocation } from 'react-location'

const history = createMemoryHistory()
const reactLocation = new ReactLocation({ history })
```

### ReactLocationProvider

**Required: true**

The `ReactLocationProvider` component is the root Provider component for `react-location` in your app. Render it at least once in the highest sensible location within your application. You can also use this component to preserve multiple location instances in the react tree at the same, which is useful for things like route animations or location mocking.

| Prop     | Required | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| location | true     | An instance of the `ReactLocation` class            |
| children | true     | The children that will receive the location context |

**Example: Basic**

```tsx
import { ReactLocation, ReactLocationProvider } from 'react-location'

const reactLocation = new ReactLocation()

return (
  <ReactLocationProvider location={reactLocation}>
    <div>Your Application</div>
  </ReactLocationProvider>
)
```

### Routes

### useRoutes

The `Routes` component & `useRoutes` hook are used to render an active route from an array (or tree) of **Route** objects.

Rotues are matched in the order of:

- Index paths (`/`)
- Hard-coded paths in the order of appearance (`about`)
- Dynamic paths (`:teamId`)
- Wildcard path (`*` )

A **Route** object consist of the following properties:

| Property | Required | type                                                   | Description                                                                                 |
| -------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| path     | true     | `string`                                               | The path to route (relative to the nearest parent `Route` component or root basepath)       |
| element  |          | `React.ReactNode`                                      | The content to be rendered when the path routees the current location                       |
| loader   |          | `(match: RouteMatch) => Promise<Record<string, any>>`  | An asynchronous function responsible for prepping the route to be rendered                  |
| redirect |          | `NavigateOptions`                                      | A static redirect using the same object of options as `<Link/>` and `useNavigate()`         |
| children |          | `React.ReactNode`                                      | An array of child routes                                                                    |
| import   |          | `({ params: Params }) => Promise<Omit<Route, 'path'>>` | An asyncronous function that resolves further route information. Useful for code-splitting! |

**Example - Route Params**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: 'invoices',
        children: [
          {
            path: '/',
            element: 'This would render at the `/invoices` path',
          },
          {
            path: 'new',
            element: `This would render at the '/invoices/new' path`,
          },
          {
            path: ':invoiceId',
            element: <Invoice />,
          },
        ],
      },
    ]}
  />
)

function Invoice() {
  const params = useParams<{ invoiceId: string }>()

  return (
    <div>
      <Link to="..">Back</Link>
      <div>This is invoice #{params.invoiceID}</div>
    </div>
  )
}
```

**Example - Default / Fallback Route**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
      },
      {
        path: 'about',
      },
      {
        path: '*',
        element: `This would render as the fallback when '/' or '/about' were not matched`,
      },
    ]}
  />
)
```

**Example - Default / Fallback Route with redirect**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
      },
      {
        path: 'about',
      },
      {
        path: '*',
        redirect: { to: '/' },
      },
    ]}
  />
)
```

**Example - Data Loaders**

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
        element: <Home />,
      },
      {
        path: 'dashboard',
        element: <Dashboard />,
      },
      {
        path: 'invoices',
        element: <Invoices />,
        // Load invoices before rendering
        load: async () => ({
          invoices: await fetchInvoices(),
        }),
        children: [
          {
            path: 'new',
            element: <NewInvoice />,
          },
          {
            path: ':invoiceId',
            element: <Invoice />,
            // Load the individual invoice before rendering
            load: async ({ params }) => ({
              invoice: await fetchInvoiceById(params.invoiceId),
            }),
          },
        ],
      },
    ]}
  />
)
```

**Example - Code Splitting**

> NOTE: Because of the asynchronous nature of code-split routes,
> subsequent loaders and child route configurations are unknown
> untile the import is resolved. Thus, any further asynchronous
> dependencies they result in (loaders or child routes)
> cannot be loaded in parallel.
>
> Regardless, they still suspend navigation as you would expect!

```tsx
const routeElement = (
  <Routes
    routes={[
      {
        path: '/',
        element: <Home />,
      },
      {
        path: 'expensive',
        import: async () => {
          return import('./Expensive').then(res => res.route)
          // Expensive.route === {
          //   element: <Expensive />,
          //   data: async ({ params }) => ({
          //     expensiveStuff: {...}
          //   }),
          // }
        },
      },
    ]}
  />
)
```

### useRoute

### Link

The `Link` component allows you to generate links for _internal_ navigation, capable of updating the:

- Pathname
- Search Parameters
- Location State
- Hash
- Push vs. Replace

The links generated by it are designed to work perfectly with `Open in new Tab` + `ctrl + left-click` and `Open in new window...`. They are also capable of receiving "active" props (depending on the `activeOptions` passed) to decorate the link when the link is currently active relative to the current location.

| Prop                                                      | Description                                                                                                                                                                                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ...[NavigateProps](#navigate)                             | All properties for the [<Navigate /> component](#navigate) method are supported here.                                                                                                                                                    |
| activeOptions?: { exact?: boolean, includeHash?: boolean} | Defaults to `{ exact: false, includeHash: false }`                                                                                                                                                                                       |
| getActiveProps: () => PropsObject                         | A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated) |

**Example: The basics**

```tsx
render(
  <div>
    <Link to="/home">I will navigate to `/home`</Link>
    <Link to="todos">
      I will navigate to `./todos`, relative to the current location
    </Link>
    <Link to="..">I will navigate up one level in the location hierarchy.</Link>
    <Link to="." hash="somehash">
      I will update the hash to `somehash` at the current location
    </Link>
    <Link to="/search" search={{ q: 'yes' }}>
      I will navigate to `/search?q=yes`
    </Link>
    <Link
      to="."
      search={{
        someParams: true,
        otherParams: 'gogogo',
        object: { nested: { list: [1, 2, 3], hello: 'world' } },
      }}
    >
      I will navigate to the current location +
      `?someParams=true&otherParams=gogogo&object=~(nested~(list~(~1~2~3)~hello~%27world))`
    </Link>
    <Link
      search={({ removeThis, ...rest }) => ({
        ...rest,
        addThis: 'This is new!',
      })}
    >
      I will add `addThis='This is new!' and also remove the `removeThis` param
      to/from the search params on the current page
    </Link>
  </div>,
)
```

**Example: Using `getActiveProps`**

The following link will be green with `/about` as the current location.

```tsx
<Link
  to="/about"
  getActiveProps={location => ({
    style: { color: 'green' },
  })}
>
  About
</Link>
```

### Navigate

When renderd, the `Navigate` component will declaratively and relatively navigate to any route.

**Type**

```ts
type NavigateProps = {
  to?: string | null
  pathname?: string | null
  search?: Updater<SearchObj>
  state?: Updater<StateObj>
  hash?: Updater<string>
  replace?: boolean
}
```

**Example**

```tsx
function App () {
  return <Navigate to='./about'>
}
```

### useNavigate

The `useNavigate` hook allows you to programmatically navigate your application.

**Usage**

```tsx
function MyComponent() {
  const navigate = useNavigate()

  const onClick = () => {
    navigate('./about', { replace: true })
  }

  return <button onClick={onClick}>About</button>
}
```

### useMatch

The `useMatch` hook allows you to programmatically test a path for a route **within the closest relative route**. If a path is match, it will return an object of route params detected, even if this is an empty object. If a path doesn't match, it will return `false`. This can be useful for detecting specific deep-route matches from a layout component

**Usage**

```tsx
function App() {
  const match = useMatch()

  // If the path is '/'
  match('/') // {}
  match(':teamId') // false

  // If the path is `/team-1'
  match('/') // {}
  match('/', { exact: true }) // false
  match(':teamId') // { teamId: 'team-1 }

  return (
    <Routes
      routes={[
        {
          path: '/',
          element: 'Hello!',
        },
        {
          path: ':teamId',
          element: 'Hello!',
        },
      ]}
    />
  )
}
```

### SSR

Server-side rendering is easy with react-location. Use `createMemoryHistory` and `ReactLocation` to mock your app into a specific state for SSR:

```tsx
import {
  createBowserHistory,
  createMemoryHistory,
  ReactLocation,
} from 'react-location'

export async function render(requestUrl) {
  // Get the URL pathname
  const url = new URL(requestUrl)
  // Create a memory history with the pathname
  let history = createMemoryHistory([url.pathname])
  // Create the location instance
  const location = new ReactLocation({ history })
  // Define your routes
  const routes: Route[] = [
    // ...
  ]
  // Match the routes to the locations current path
  // This also does any `import`s defined in routes
  const routeMatch = await matchRoutes(location.current.pathname, routes)
  // Perform any loading required for the matched route
  await loadMatch(routeMatch)

  ReactDOMServer.renderToString(
    <ReactLocationProvider>
      <Routes initialMatch={routeMatch} routes={routes} />
    </ReactLocationProvider>,
  )
}
```

### Inspiration

All of these libraries offered a lot of guidance and design inspiration for this library:

- [`React Router`](https://reacttraining.com/react-router/)
- [`Next.js`](https://nextjs.org)

<!-- Blah Blah Blah >
