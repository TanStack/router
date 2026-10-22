---
'@tanstack/start-plugin-core': patch
---

Fix prerendering failing with `ERR_MODULE_NOT_FOUND` when the server build emits an entry named something other than `<serverInput>.js` (for example a configured `output.entryFileNames`, or a Cloudflare/Nitro build that emits `index.mjs`). The preview server now resolves the entry the build actually emitted, and when it cannot find one it throws a clear error listing the filenames it looked for and the files present in the server output directory instead of an opaque 500.
