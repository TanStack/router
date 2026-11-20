---
'@tanstack/router-core': minor
---

Pass the destination location to `onEnter`, `onStay` and `onLeave`. The hooks now receive a second argument, `RouteLifecycleContext`, whose `location` is the location the router is navigating to - the newly matched branch for `onEnter`/`onStay`, and the destination that replaces the leaving route for `onLeave`. Existing one-parameter hooks are unaffected.
