---
id: RouterEventsType
title: RouterEvents type
---

The `RouterEvents` type contains all of the events that the router can emit.

## RouterEvents `properties`

Each property on this type is an event that the router can emit. The value of each property is an object that contains the following properties:

### `type` property

- Type: `onBeforeLoad | onLoad | onResolved`
- The type of the event
- This is useful for discriminating between events in a listener function.

### `fromLocation` property

- Type: `ParsedLocation`
- The location that the router is transitioning from.

### `toLocation` property

- Type: `ParsedLocation`
- The location that the router is transitioning to.

### `pathChanged` property

- Type: `boolean`
- `true` if the path has changed between the `fromLocation` and `toLocation`.
