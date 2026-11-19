---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
'@tanstack/start-client-core': patch
---

Keep the dev SSR stylesheet after hydration until an HMR update makes it stale.

Previously `HeadContent` removed the `/@tanstack-start/styles.css` link as soon as the app hydrated. Server-rendered content inside a Suspense boundary whose module was still loading (for example a `React.lazy` component) lost its styles until the bundler injected them, causing a flash of unstyled content in development.
