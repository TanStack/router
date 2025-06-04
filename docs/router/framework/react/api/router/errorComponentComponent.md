---
id: errorComponentComponent
title: ErrorComponent component
---

The `ErrorComponent` component is a component that renders an error message and optionally the error's message.

## ErrorComponent props

The `ErrorComponent` component accepts the following props:

### `props.error` prop

- Type: `any`
- The error that was thrown by the component's children

### `props.reset` prop

- Type: `() => void`
- A function to programmatically reset the error state

## ErrorComponent returns

- Returns a formatted error message with the error's message if it exists.
- The error message can be toggled by clicking the "Show Error" button.
- By default, the error message will be shown in development.
