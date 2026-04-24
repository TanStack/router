---
'@tanstack/react-router': patch
---

Fix a client-side crash when a root `beforeLoad` redirect races with pending UI and a lazy target route while `defaultViewTransition` is enabled.

React now handles stale redirected matches more safely during the transition, and a dedicated `e2e/react-router/issue-7120` fixture covers this regression.
