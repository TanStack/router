---
title: Devtools
---

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
