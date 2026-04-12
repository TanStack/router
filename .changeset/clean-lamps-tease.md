---
'@tanstack/router-generator': patch
'@tanstack/react-router': patch
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Fix route file transforms to preserve route ID quoting, handle more exported `Route` patterns, and avoid incorrect import rewrites in edge cases.

Improve transform robustness with clearer route-call detection, safer import removal, and expanded test coverage for quote preservation, constructor swaps, and unsupported route definitions.
