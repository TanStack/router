---
title: Devtools
---

> Link, take this sword... I mean Devtools!... to help you on your way!

Wave your hands in the air and shout hooray because TanStack Router comes with dedicated devtools! 🥳

When you begin your TanStack Router journey, you'll want these devtools by your side. They help visualize all of the inner workings of TanStack Router and will likely save you hours of debugging if you find yourself in a pinch!

> Please note that for now, the devtools **are only supported in React**. If you would like to help us make the devtools platform-agnostic, please let us know!

## Installation

```sh
npm install @tanstack/react-router-devtools@beta --save
```

## Import the Devtools

```js
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
```

## Only importing and using Devtools in Development

To do this, simply use lazy and the env variable of your choice to optionally return a dummy component:

```tsx
const TanStackRouterDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null // Render nothing in production
    : React.lazy(() =>
        // Lazy load in development
        import('@tanstack/react-router-devtools').then((res) => ({
          default: res.TanStackRouterDevtools,
          // For Embedded Mode
          // default: res.TanStackRouterDevtoolsPanel
        })),
      )
```

## Using inside of the `RouterProvider`

The easiest way for the devtools to work is to render them inside of your `RootRoute` (or any other route). This will automatically connect the devtools to the router instance.

```tsx
const rootRoute = new RootRoute({
  component: () => (
    <>
      <Outlet />
      <TanStackRouterDevtools />
    </>
  ),
})

const router = new ReactRouter({
  routes: [rootRoute],
})

function App() {
  return <RouterProvider router={router} />
}
```

## Manually passing the Router Instance

If rendering the devtools inside of the `RouterProvider` isn't your cup of tea, a `router` prop for the devtools accepts the same `router` instance you pass to the `Router` component. This makes it possible to place the devtools anywhere on the page, not just inside of the provider:

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
