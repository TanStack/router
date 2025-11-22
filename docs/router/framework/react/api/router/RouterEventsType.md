---
id: RouterEventsType
title: RouterEvents type
---

The `RouterEvents` type contains all of the events that the router can emit. Each top-level key of this type, represents the name of an event that the router can emit. The values of the keys are the event payloads.

```tsx
type RouterEvents = {
  onBeforeNavigate: {
    type: 'onBeforeNavigate'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onBeforeLoad: {
    type: 'onBeforeLoad'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onLoad: {
    type: 'onLoad'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onResolved: {
    type: 'onResolved'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onBeforeRouteMount: {
    type: 'onBeforeRouteMount'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onInjectedHtml: {
    type: 'onInjectedHtml'
    promise: Promise<string>
  }
  onRendered: {
    type: 'onRendered'
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onViewTransitionStart: {
    type: 'onViewTransitionStart'
    transition: ViewTransition
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onViewTransitionReady: {
    type: 'onViewTransitionReady'
    transition: ViewTransition
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onViewTransitionUpdateCallbackDone: {
    type: 'onViewTransitionUpdateCallbackDone'
    transition: ViewTransition
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
  onViewTransitionFinish: {
    type: 'onViewTransitionFinish'
    transition: ViewTransition
    fromLocation?: ParsedLocation
    toLocation: ParsedLocation
    pathChanged: boolean
    hrefChanged: boolean
    hashChanged: boolean
  }
}
```

## RouterEvents properties

Once an event is emitted, the following properties will be present on the event payload.

### `type` property

- Type: `onBeforeNavigate | onBeforeLoad | onLoad | onBeforeRouteMount | onResolved | onRendered | onViewTransitionStart | onViewTransitionReady | onViewTransitionUpdateCallbackDone | onViewTransitionFinish`
- The type of the event
- This is useful for discriminating between events in a listener function.

### `fromLocation` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The location that the router is transitioning from.

### `toLocation` property

- Type: [`ParsedLocation`](../ParsedLocationType.md)
- The location that the router is transitioning to.

### `pathChanged` property

- Type: `boolean`
- `true` if the path has changed between the `fromLocation` and `toLocation`.

### `hrefChanged` property

- Type: `boolean`
- `true` if the href has changed between the `fromLocation` and `toLocation`.

### `hashChanged` property

- Type: `boolean`
- `true` if the hash has changed between the `fromLocation` and `toLocation`.

### `transition` property

- Type: `ViewTransition`
- Available on: `onViewTransitionStart`, `onViewTransitionReady`, `onViewTransitionUpdateCallbackDone`, `onViewTransitionFinish`
- The [ViewTransition](https://developer.mozilla.org/en-US/docs/Web/API/ViewTransition) object representing the view transition in progress.
- This property allows you to interact with the view transition lifecycle, including access to promises like `ready`, `updateCallbackDone`, and `finished`.

## Example

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree })

const unsub = router.subscribe('onResolved', (evt) => {
  // ...
})
```
