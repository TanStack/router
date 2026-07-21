---
id: errorComponentComponent
title: ErrorComponent component
---

The `ErrorComponent` component is a component that renders an error message and optionally the error's message.

## ErrorComponent props

The `ErrorComponent` component accepts the following props:

### `props.error` prop

- Type: `unknown`
- The error that was thrown by the component's children

  Anything can be thrown in JavaScript, and route loading and rendering code is
  no exception — a `loader` may `throw 'oops'` or throw a rich domain object
  instead of an `Error`. The prop is therefore typed as `unknown`, and error
  components must narrow the value before accessing error-specific properties:

  ```tsx
  errorComponent: ({ error }) => {
    const message = error instanceof Error ? error.message : String(error)

    return <div>{message}</div>
  }
  ```

### `props.info` prop

- Type: `{ componentStack: string }`
- Optional
- Additional information about where the error was thrown, such as the React component stack trace.

### `props.reset` prop

- Type: `() => void`
- A function to programmatically reset the error state

## ErrorComponent returns

- Returns a formatted error message with the error's message if it exists.
- The error message can be toggled by clicking the "Show Error" button.
- By default, the error message will be shown in development.
