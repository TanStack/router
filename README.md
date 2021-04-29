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

## Features

- Familiar API inspired by React Router & Next.js
- JSON Search Param API
- Search Param compression
- Full ⌘/Ctrl-click Support
- Transactionally Safe Location Updates
- Relative Routing + Links

## Table of Contents

<!-- START doctoc generated TOC please keep comment here to allow auto update -->
<!-- DON'T EDIT THIS SECTION, INSTEAD RE-RUN doctoc TO UPDATE -->

- [Getting Started](#getting-started)
- [Documentation](#documentation)
  - [ReactLocation](#reactlocation)
  - [Route](#route)
  - [Routes](#routes)
  - [Link](#link)
  - [useLocation](#uselocation)
  - [Navigate](#navigate)
  - [`useNavigate`](#usenavigate)
  - [`useMatch`](#usematch)
  - [SSR](#ssr)
  - [Inspiration](#inspiration)

<!-- END doctoc generated TOC please keep comment here to allow auto update -->

## Getting Started

1. Install `react-location@next`

```sh
npm install react-location@next --save
# or
yarn add react-location@next
```

2. Import and use `react-location`

```js
import { React } from 'react';
import { ReactLocation, Route, Routes, Link, useParams } from 'react-location';

export function App() {
  return (
    <ReactLocation>
      <nav>
        <Link to="/">Home</Link>
        <Link to="dashboard">Dashboard</Link>
        <Link to="invoices">Invoices</Link>
        <Link to="https://github.com/tannerlinsley/react-location">
          Github - React Location
        </Link>
      </nav>
      <div>
        <Route path="/" element={<div>This is Home</div>} />
        <Route path="dashboard" element={<div>This is the Dashboard</div>} />
        <Route path="invoices" element={<Invoices />}></Route>
      </div>
    </ReactLocation>
  );
}

function Invoices() {
  return (
    <Routes>
      <Route path="/">
        <div>Invoices</div>
        <ul>
          <li>
            <Link to="new">New Invoice</Link>
          </li>
          <li>
            <Link to="1">Invoice 1</Link>
          </li>
          <li>
            <Link to="2">Invoice 2</Link>
          </li>
          <li>
            <Link to="3">Invoice 3</Link>
          </li>
        </ul>
      </Route>
      <Route
        path="new"
        element={
          <>
            <Link to="..">Back</Link>
            <div>This is a new invoice!</div>
          </>
        }
      />
      <Route path=":invoiceID" element={<Invoice />} />
    </Routes>
  );
}

function Invoice() {
  const params = useParams();
  const search = useSearch();
  const navigate = useNavigate();

  const isPreviewOpen = search.previewState?.isOpen;

  const togglePreview = () =>
    navigate('.', {
      search: (old) => ({
        ...old,
        previewState: {
          ...(old.previewState ?? {}),
          isOpen: !old.previewState.isOpen,
        },
      }),
    });

  return (
    <div>
      <Link to="..">Back</Link>
      <div>This is invoice #{params.invoiceID}</div>
      <div>
        <button onClick={togglePreview}>
          {isPreviewOpen ? 'Hide' : 'Show'} Preview
        </button>
      </div>
      {isPreviewOpen ? <div>This is a preview!</div> : null}
    </div>
  );
}
```

## Documentation

### ReactLocation

**Required: true**

The `ReactLocation` component is the root Provider component for `react-location` in your app. Render it at least once in the highest sensible location within your application. You can also use this component to preserve multiple location instances in the react tree at the same, which is useful for things like route animations or location mocking.

| Prop     | Required | Description                                                                  |
| -------- | -------- | ---------------------------------------------------------------------------- |
| history  | false    | The history object to be used internally by react-location                   |
| basepath | false    | The basepath prefix for all URLs (not-supported for memory source histories) |
| children | true     | The children to pass the location context to                                 |

**Example: Basic**

```tsx
import { ReactLocation } from 'react-location';

return (
  <ReactLocation>
    <div>Your Application</div>
  </ReactLocation>
);
```

**Example: Memory History**

```tsx
import { createMemoryHistory, ReactLocation } from 'react-location';

const history = createMemoryHistory();

return (
  <ReactLocation history={history}>
    <div>...</div>
  </ReactLocation>
);
```

### Route

The `Route` component is used to render content when its path routees the current history's location. It is generally used for routing purposes. It also provides the new relative routeing path to child `Route` components, allowing for clean nested route definition.

| Prop    | Required | Description                                                                           |
| ------- | -------- | ------------------------------------------------------------------------------------- |
| path    | true     | The path to route (relative to the nearest parent `Route` component or root basepath) |
| element |          | The content to be rendered when the path routees the current location                 |

**Example**

```tsx
<Route path="about" element="About Me" />
```

### Routes

The `Routes` component is used to selectively render the first child component that is av valid route and/or provide fallbacks. This is useful for:

- Nesting and Relative Routes
- Matching index routes and hard-coded routes before dynamic ones
- Fallback/Wildcard routes

**Example - Route Params**

```tsx
render(
  <Route path="invoices">
    <Routes>
      <Route
        path="/"
        element="This route would route and display at `/invoices/`"
      />
      <Route
        path="new"
        element="This route would route and display at `/invoices/new`"
      />
      <Route path=":invoiceID" element={<Invoice />} />
    </Routes>
  </Route>
);

function Invoice() {
  const params = useParams();

  return (
    <div>
      <Link to="..">Back</Link>
      <div>This is invoice #{params.invoiceID}</div>
    </div>
  );
}
```

**Example - Default / Fallback Route**

```tsx
render(
  <Routes>
    <Route path="/" element="his route would route and display at `/`" />
    <Route
      path="about"
      element="This route would route and display at `/about`"
    />
    <Route
      path="*"
      element="This element would be rendered as the fallback when no matches are found"
    />
  </Routes>
);
```

\*\*Example - Default / Fallback Route with redirect

```tsx
render(
  <Routes>
    <Route path="/" element="This route would route and display at `/`" />
    <Route
      path="about"
      element="This route would route and display at `/about`"
    />
    {/* Redirect all other routes to `/` */}
    <Route path="*" element={<Navigate to="/" />} />
  </Routes>
);
```

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
  </div>
);
```

**Example: Using `getActiveProps`**

The following link will be green with `/about` as the current location.

```tsx
<Link
  to="/about"
  getActiveProps={(location) => ({
    style: { color: 'green' },
  })}
>
  About
</Link>
```

### useLocation

The `useLocation` hook returns the current [React Location instance](#react-location-instance) from context when used.

**Example**

```tsx
import { useLocation } from 'react-location';

export function MyComponent() {
  const location = useLocation();
  // use location...
}
```

### Navigate

When renderd, the `Navigate` component will declaratively and relatively navigate to any route.

**Type**

```ts
type NavigateProps = {
  to: string;
  search?: Updater<SearchObj>;
  state?: Updater<StateObj>;
  hash?: Updater<string>;
  replace?: boolean;
};
```

**Example**

```tsx
function App () {
  return <Navigate to='./about'>
}
```

### `useNavigate`

The `useNavigate` hook allows you to programmatically navigate your application.

**Usage**

```tsx
function MyComponent() {
  const navigate = useNavigate();

  const onClick = () => {
    navigate('./about', { replace: true });
  };

  return <button onClick={onClick}>About</button>;
}
```

### `useMatch`

The `useMatch` hook allows you to programmatically test a path for a route **within the closest relative route**. If a path is match, it will return an object of route params detected, even if this is an empty object. If a path doesn't match, it will return `false`.

**Usage**

```tsx
function App() {
  const match = useMatch();

  // If the path is '/'
  match('/'); // {}
  match(':teamId'); // false

  // If the path is `/team-1'
  match('/'); // {}
  match('/', { exact: true }); // false
  match(':teamId'); // { teamId: 'team-1 }

  return (
    <Routes>
      <Route path="/" element="Hello!" />
      <Route path=":teamId" element="Hello!" />
    </Routes>
  );
}
```

### SSR

Server-side rendering is easy with react-location. Use `createMemoryHistory` and `ReactLocation` to mock your app into a specific state for SSR:

```js
import {
  createBrowserHistory
  createMemoryHistory,
  ReactLocation,
} from 'react-location';

let history;

if (typeof document !== 'undefined') {
  history = createBrowserHistory();
} else {
  history = createMemoryHistory(['/blog/post/2]);
}

return (
  <ReactLocation history={history}>
    <div>...</div>
  </ReactLocation>
);
```

### Inspiration

All of these libraries offered a lot of guidance and good patterns for writing this library:

- [`React Router`](https://reacttraining.com/react-router/)
- [`Next.js`](https://nextjs.org)

<!-- Blah Blah Blah >
