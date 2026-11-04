---
'@tanstack/router-plugin': patch
---

Check the Vite plugin order (the router plugin before the framework's JSX plugin) only when `autoCodeSplitting` is on, as before: without splitting, route HMR works whatever the order, so a config listing `react()` or `solid()` first is not an error.
