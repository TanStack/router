---
title: Helpful Tips
---

> Link, take this sword... I mean Devtools!... to help you on your way!

Wave your hands in the air and shout hooray because TanStack Router comes with dedicated devtools! 🥳

When you begin your TanStack Router journey, you'll want these devtools by your side. They help visualize all of the inner workings of TanStack Router and will likely save you hours of debugging if you find yourself in a pinch!

> Please note that for now, the devtools **do not support React Native**. If you would like to help us make the devtools platform-agnostic, please let us know!

## Import the Devtools

The devtools are bundle split into the `react-router-devtools` package. No need to install anything extra, just:

```js
import { ReactLocationDevtools } from '@tanstack/react-router-devtools'
```

By default, TanStack Router Devtools are only included in bundles when `process.env.NODE_ENV === 'development'`, so you don't need to worry about excluding them during a production build.

## Floating Mode

Floating Mode will mount the devtools as a fixed, floating element in your app and provide a toggle in the corner of the screen to show and hide the devtools. This toggle state will be stored and remembered in localStorage across reloads.

Place the following code as high in your React app as you can. The closer it is to the root of the page, the better it will work!

```js
import { ReactLocationDevtools } from '@tanstack/react-router-devtools'

function App() {
  return (
    <Router>
      <Outlet />
      <ReactLocationDevtools initialIsOpen={false} />
    </Router>
  )
}
```

### Options

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
import { ReactLocationDevtoolsPanel } from '@tanstack/react-router-devtools'

function App() {
  return (
    <Router>
      <Outlet />
      <ReactLocationDevtoolsPanel style={styles} className={className} />
    </Router>
  )
}
```

### Options

Use these options to style the devtools.

- `style: StyleObject`
  - The standard React style object used to style a component with inline styles
- `className: string`
  - The standard React className property used to style a component with classes
