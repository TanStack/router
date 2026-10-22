---
'@tanstack/start-plugin-core': patch
---

Reduce Rspack API calls during client build normalization by reading chunk group files in bulk, collecting JS and CSS files in one pass, and skipping unnecessary chunk name reads.
