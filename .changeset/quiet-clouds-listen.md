---
'@tanstack/router-core': patch
---

Support returned redirects from route context and context revalidation. Make hydration cancellation interrupt pending serial work, recover from failed transforms after their ancestors settle, and preserve shared loader work during asynchronous context preparation.

Defer hydration redirect handling to normal client loading, release obsolete work promptly, and avoid constructing unused callback arguments and loader promises while restoring server data.
