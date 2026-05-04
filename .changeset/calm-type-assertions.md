---
'@tanstack/router-generator': patch
'@tanstack/router-plugin': patch
'@tanstack/router-utils': patch
'@tanstack/start-plugin-core': patch
---

Parse plain TypeScript files without JSX when a filename is available, preventing angle-bracket type assertions from being interpreted as JSX during route and Start import-protection transforms.
