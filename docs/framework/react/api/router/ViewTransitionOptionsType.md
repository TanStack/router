---
id: ViewTransitionOptionsType
title: ViewTransitionOptions type
---

The `ViewTransitionOptions` type is used to define a
[viewTransition type](https://developer.chrome.com/docs/web-platform/view-transitions/same-document#view-transition-types).

```tsx
interface ViewTransitionOptions {
  types: Array<string>
}
```

## ViewTransitionOptions properties

The `ViewTransitionOptions` type accepts an object with a single property:

### `types` property

- Type: `Array<string>`
- Required
- The types array that will be passed to the `document.startViewTransition({update, types}) call`;
