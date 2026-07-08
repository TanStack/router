---
'@tanstack/router-plugin': patch
---

fix(router-plugin): escape single quotes in code-split importer paths

The code splitter now escapes `'` and `\` when interpolating the split url into the generated `import('...')` statement, so projects whose absolute path contains an apostrophe (e.g. `/Users/dev/it's a repro/...`) compile instead of failing to parse on every route.

Fixes #7754.
