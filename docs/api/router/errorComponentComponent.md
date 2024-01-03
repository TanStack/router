---
id: errorComponentComponent
title: ErrorComponent component
---

The `ErrorComponent` component is a component that renders an error message and optionally the error's message.

### Props

#### `props.error`

- Type: `any`
- Required
- The error that was thrown by the component's children

### Returns

- Returns a formatted error message with the error's message if it exists. The error message can be toggled by clicking the "Show Error" button. By default, the error message shown by default in development.
