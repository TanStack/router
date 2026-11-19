---
'@tanstack/react-start-rsc': patch
---

Load the browser Flight client runtime (`react-server-dom` client plus lazy-element/CSS post-processing) on first server component decode instead of bundling it into the client entry chunk. Enabling RSC no longer adds ~20 kB raw / ~6.4 kB gzip to the entry chunk of every route; only routes that decode a server component fetch it.
