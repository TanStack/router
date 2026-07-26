---
'@tanstack/router-core': patch
---

fix(router-core): fire `onBeforeNavigate` on every navigation, including those following a `beforeLoad` `redirect(...)`

`onBeforeNavigate` was gated on `stores.redirect` being unset, but that store was populated whenever `beforeLoad` threw `redirect(...)` and never cleared. As a result, every navigation after the first in-`beforeLoad` redirect silently skipped the `onBeforeNavigate` emission (`onBeforeLoad` next to it never had this gate). This broke Sentry's TanStack Router tracing integration and any userland pattern (e.g. form-state persistence) that hooks into `onBeforeNavigate`.

The gate is removed so `onBeforeNavigate` now matches `onBeforeLoad` and fires on every navigation.

Fixes #3920.
