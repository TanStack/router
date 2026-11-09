---
'@tanstack/start-plugin-core': patch
---

Prerendering with automatic static path discovery includes lazy-only routes again (`about.lazy.tsx` without `about.tsx`): their component is in the lazy file.
