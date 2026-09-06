---
'@tanstack/start-plugin-core': patch
---

Update the workspace Vite dependency from 8.0.14 to 8.2.2 and keep bundled-dev hydration and hot updates working with Vite's separate client runtime and rebuild lifecycle.

Collect bundled-dev SSR styles from completed client bundles without starting a second client plugin lifecycle. Bundled clients compile eagerly while dev SSR styles are enabled so initial CSS and its assets are available; disabling SSR styles preserves lazy compilation. Unbundled development retains its existing style collector.

Reuse SSR module evaluations and transforms across unchanged bundled-dev requests instead of clearing the entire SSR cache for every request.
