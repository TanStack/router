# React-Location

<a href="https://npmjs.com/package/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/npm/dm/react-location.svg" />
</a>
<a href="https://spectrum.chat/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/badge/spectrum-react--chat-purple.svg" />
</a>
<a href="https://github.com/tannerlinsley/react-location" target="\_parent">
  <img alt="" src="https://img.shields.io/github/stars/tannerlinsley/react-location.svg?style=social&label=Star" />
</a>
<a href="https://twitter.com/tannerlinsley" target="\_parent">
  <img alt="" src="https://img.shields.io/twitter/follow/tannerlinsley.svg?style=social&label=Follow" />
</a>

### ⚛️ React-Location is a modern Router for React

It's been built with the following considerations in mind:

- Clean and clear routing syntax
- Familiar API for productivity
- Functional query params & URL parsing
- Complex Link generation
- Relative Routing + Links
- Both Colocated or Nested Route structure
- Programmatic Navigation
- Hooks
- Support for URL or in-memory location sources

## Get Started

**NOTE: React-Location requires React Hooks. Please verify you are using a version of React that supports them.**

1. Install `react-location`

```sh
# React-Location is currently in beta, please use the @next tag to install the latest beta version

yarn add react-location@next
# or
npm i -s react-location@next
```

2. Import and use `react-location`

```js
import { React } from "react";
import { render } from "react-dom";
import { LocationProvider, Match, MatchFirst, Link } from "react-location";

render(
  <LocationProvider>
    <nav>
      <Link to="/">Home</Link>
      <Link to="dashboard">Dashboard</Link>
      <Link to="invoices">Invoices</Link>
    </nav>
    <div>
      <Match path="/">
        <div>This is Home</div>
      </Match>
      <Match path="dashboard">
        <div>This is the Dashboard</div>
      </Match>
      <Match path="invoices">
        <MatchFirst>
          <Match path="/">
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
          </Match>
          <Match path="new">
            <Link to="..">Back</Link>
            <div>This is a new invoice!</div>
          </Match>
          <Match path=":invoiceID">
            {({ params }) => (
              <div>
                <Link to="..">Back</Link>
                This is invoice #{params.invoiceID}
              </div>
            )}
          </Match>
        </MatchFirst>
      </Match>
    </div>
  </LocationProvider>
);
```

# Table of Contents

- [Documentation](#documentation)
  - [LocationProvider](#locationprovider)
  - [Match](#match)
  - [MatchFirst](#matchfirst)
  - [Link](#link)
  - [useLocation, Location, withLocation](#uselocation-location-withlocation)
  - [Redirect](#redirect)
  - [createHistory](#createhistory)
  - [createMemorySource](#creatememorysource)
  - [Location API](#location-api)
- [Contribution and Roadmap](#contribution-and-roadmap)
- [Inspiration and Thanks](#inspiration-and-thanks)

# Documentation

## LocationProvider

**Required: true**

The `LocationProvider` component is the root Provider component for `react-location` in your app. Render it at least once in the highest sensible location within your application. You can also use this component to preserve multiple location instances in the react tree at the same, which is useful for things like route animations or location mocking.

| Prop     | Required | Description                                                                                                                                                                                                                                                                        |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| history  | false    | The history object to be used internally by react-location                                                                                                                                                                                                                         |
| basepath | false    | The basepath prefix for all URLs (not-supported for memory source histories)                                                                                                                                                                                                       |
| location | false    | A custom location to use instead of creating a new one. If a location is passed here, all other props will be ignored and will be inherited from the custom location instead. This useful for things like animation or preserving multiple locations in the tree at the same time. |
| children | true     | The children to pass the location context to                                                                                                                                                                                                                                       |

**Example: Animated Routes**

```javascript
import { LocationProvider, Location, Match } from "react-location";

const AnimatedWrapper = ({ children }) => (
  <Location>
    {location => (
      // Get the current location and its key
      // Use location.key as the unique ID in your animations
      <TransitionGroup className="transition-group">
        <CSSTransition key={location.key} classNames="fade" timeout={500}>
          {/* Manually pass LocationProvider the location prop for each animation */}
          <LocationProvider location={location} />
        </CSSTransition>
      </TransitionGroup>
    )}
  </Location>
);

render(
  <LocationProvider>
    <AnimatedWrapper>
      <MatchFirst>
        <Match path="/page/:pageID">
          {({ pageID, location }) => (
            <div
              className="page"
              style={{ background: `hsl(${pageID * 75}, 60%, 60%)` }}
            >
              {pageID}
            </div>
          )}
        </Match>
      </MatchFirst>
    </AnimatedWrapper>
  </LocationProvider>
);
```

## Match

The `Match` component is used to render content when its path matches the current history's location. It is generally used for routing purposes. It also provides the new relative matching path to child `Match` components, allowing for clean nested route definition.

| Prop                        | Required | Description                                                                                                                                                 |
| --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| path                        | true     | The path to match (relative to the nearest parent `Match` component or root basepath)                                                                       |
| children                    |          | The content to be rendered when the path matches the current location                                                                                       |
| children()/render/component |          | The function to be called when the path matches the current location. This function is called with the [`location` API](#location-api) as the only paramter |

**Example**

```javascript
// Render children directly
render(<Match path="about">About me</Match>);

// Use children as a function
render(
  <Match path=":invoiceID">
    {location => <div>This is invoice #{location.params.invoiceID}</div>}
  </Match>
);

// Use a render function
render(
  <Match
    path=":invoiceID"
    render={location => <div>This is invoice #{location.params.invoiceID}</div>}
  />
);

// Use a component
const Invoice = ({ dark, location }) => (
  <div>This is invoice #{location.params.invoiceID}</div>
);

render(<Match path=":invoiceID" component={Invoice} dark />);
```

## MatchFirst

The `MatchFirst` component is used to selectively render the first child component that is av valid match and/or provide fallbacks. This is useful for:

- Nesting and Relative Routes
- Matching index routes and hard-coded routes before dynamic ones
- Default / fallback routes

**Example - Route Params**

```javascript
render(
  <Match path="invoices">
    <MatchFirst>
      <Match path="/">This route would match and display at `/invoices/`</Match>
      <Match path="new">
        This route would match and display at `/invoices/new`
      </Match>
      <Match path=":invoiceID">
        {({ params }) => (
          <div>
            This route would match for all other `/invoices/:invoiceID/` routes
          </div>
        )}
      </Match>
    </MatchFirst>
  </Match>
);
```

**Example - Default / Fallback Route**

```javascript
render(
  <MatchFirst>
    <Match path="/">This route would match and display at `/`</Match>
    <Match path="about">This route would match and display at `/about`</Match>
    <div>
      This element would be rendered as the fallback when no Matches are found
    </div>
  </MatchFirst>
);
```

## Link

The `Link` component allows you to generate `<a href/>` links for navigation, capable of updating the:

- Route path + hash
- Query parameters
- State
- Push vs. Replace

The links generated by it are designed to work perfectly with `Open in new Tab` + `ctrl + left-click` and `Open in new window...`. They are also capable of receiving "active" props (depending on the `activeType` passed) to decorate the link when the link is currently active relative to the current location.

| Prop                     | Type                                                | Description                                                                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ...[navigate](#navigate) |                                                     | All properties for the [navigate](#navigate) method are supported here.                                                                                                                                                                  |
| activeType               | string (one of `partial`, `path`, `hash` or `full`) | Defaults to `full`. Defines which matching strategy is used to determine if the link is `active` or not. See the table below for more information.                                                                                       |
| getActiveProps           | function                                            | A function that is passed the [Location API](#location-api) and returns additional props for the `active` state of this link. These props override other props passed to the link (`style`'s are merged, `className`'s are concatenated) |

**Example: The basics**

```javascript
render(
  <div>
    <Link to="/home">I will navigate to `/home`</Link>
    <Link to="todos">
      I will navigate to `./todos`, relative to the current location
    </Link>
    <Link to="..">I will navigate up one level in the location hierarchy.</Link>
    <Link to="#somehash">
      I will navigate to the hash `somehash` at the current location
    </Link>
    <Link to="/search?stringQuery=yes!">I will navigate to `/search?stringQuery=yes!`</Link>
    <Link
      query={
        someParams: true,
        otherParams: 'gogogo',
        object: { nested: { list: [1, 2, 3], hello: "world" } }
      }}
    >
      I will navigate to the current location + `?someParams=true&otherParams=gogogo&object=%7B%22nested%22%3A%7B%22list%22%3A%5B1%2C2%2C3%5D%2C%22hello%22%3A%22world%22%7D%7D`
    </Link>
    <Link
      query={query => ({
        ...query,
        addThis: 'This is new!',
        removeThis: undefined
      })}
    >
      I will add `addThis='This is new!' and also remove the `removeThis` param to/from the query params on the current page
    </Link>
  </div>
);
```

**Example: Using `getActiveProps`**

The following link will be green with `/about` as the current location.

```javascript
<Link
  to="/about"
  getActiveProps={location => ({
    style: { color: "green" }
  })}
>
  About
</Link>
```

**Using `activeType`**

As mentioned above, `activeType` configures when a link is considered "active", and when `getActiveProps()` is run and applied to the link. Below is a table demonstrating the various options and how they behave:

| Type | Description | Example |
| ---- | ----------- | ------- |


| `full`
| `hash`

## useLocation, Location, withLocation

The `useLocation` hook, `Location` component and `withLocation` HOC all return the current [`location` API](#location-api) from context when used.

**Example**

```javascript
import { useLocation, Location, withLocation } from "react-location";

// Hook
export function MyComponent() {
  const location = useLocation();
  // use location...
}

// Component
export function MyComponent() {
  return (
    <Location>
      {location => {
        // use location...
      }}
    </Location>
  )
}

// HOC
export const MyComponent = withLocation(({ location }) => {
  // use location...
})
```

## Redirect

The `Redirect` component can be used to redirect from one route to another based on a matching path.

| Prop                     | Description                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| from                     | The path to match. Behaves the same way a `Match` does.                                                         |
| ...[navigate](#navigate) | All properties for the [navigate](#navigate) method are supported here, but with `replace` defaulting to `true` |

## createHistory

Creates a custom history object. You can pass this history object to the `LocationProvider` or just use it to listen to the history of the page.

**Example**

```javascript
import { createMemorySource, createHistory } from "react-location";

// Use the window history (DOM only)
let history = createHistory(window);

// You can also pass it a memorySource instance for in-memory or SSR routing
let source = createMemorySource("/starting/url");
let history = createHistory(source);
```

## createMemorySource

Creates a source for `createHistory` that manages a history stack in memory. You may want to use a memory source if you are using an environment that doesn't support or have reliable access to the window location eg. Node, Electron, Ionic, Cordova etc.

See [createHistory](#createHistory) for an example

# Location API

React-Location's model and API is located in a single object, passed via context, throughout the library. It contains both the current state and API for location. It is made available via:

- The return result for the `useLocation` hook, `Location` component, `withLocation` HOC. [See Example](#uselocation-location-withlocation)
- Via props passed to the `render` function, `children` function, and `component`s that are rendered with the `Match` component. [See Example](#match)
- The first parameter of the `Link` component's `getActiveProps` prop function. [See Example](#link)

The following **properties** are available on the `location` API:

| Property   | Type   | Description                                                  |
| ---------- | ------ | ------------------------------------------------------------ |
| `basepath` | string | The basepath of the API, including parent paths.             |
| `pathname` | string | The pathname of the location.                                |
| `hash`     | string | The hash of the location with the `#` removed.               |
| `params`   | string | The params, deserialized to an `object` with key-value pairs |
| `query`    | string | The query, deserialized to an `object` with key-value pairs  |
| `search`   | string | The search string of the location                            |
| `state`    | string | The location's custom state `object`                         |
| `href`     | string | The full url                                                 |
| `history`  | string | The underlying `history` object used to power the location   |

The following **methods** are available on the `location` API:

### `navigate`

The `navigate` function allows you to programmatically navigate your application. It is the same method that powers all of the components in this library.

**Usage**

```javascript
const Promise = navigate(
  to:string,
  {
    query: object{} | function(old) => new,
    state: object{} | function(old) => new,
    replace: boolean = false
    preview: boolean = false
  }
);
```

**Argument Information**

| Prop    | Type            | Description                                                                                                                                           |
| ------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| to      | string          | The path this link navigates to. It can be absolute, relative, external and can also contain a #hash. Defaults to the current location if not defined |
| query   | object/function | Either (1) the replacement query parameters for this link as an object, or (2) a function that receives the old query parameters and returns new ones |
| state   | object/function | Either (1) the replacement state for this link as an object, or (2) a function that receives the old state and returns new ones                       |
| replace | boolean         | Whether or not to replace the current history entry when this link is clicked                                                                         |
| preview | boolean         | When `true`, returns the `href` produced by this Link                                                                                                 |

## Contribution and Roadmap

- [ ] Improve Accessibility (Hopefully to the level of Reach Router)
- [ ] Write Tests
- [ ] Continuous Integration & Automated Releases

Open an issue or PR to discuss!

## Inspiration and Thanks

This library was heavily inspired by both [`@reach/router`](https://reach.tech/router) and [`react-router`](https://reacttraining.com/react-router/). In some cases, utility functions were copy and pasted into this library (that's how good they are). Both are extremely fantastic tools that have set standards for the quality of routers in React.]
