---
'@tanstack/router-core': minor
'@tanstack/router-generator': patch
'@tanstack/eslint-plugin-router': patch
---

Add non-terminal variadic path parameters: `{...$param}` matches zero or more URL segments in the middle of a path and binds them as `Array<string>` (each segment decoded independently). Unlike the terminal `$` splat, routes can continue after a variadic segment, enabling paths where a variable-depth hierarchy sits between fixed parts of the URL (`/$bucket/{...$folders}/$file/versions/$versionId`). Matching is non-greedy (the variadic consumes as few segments as the rest of the pattern allows) and ranks below optional parameters and above the terminal wildcard. Consecutive variadic segments (and a variadic followed by a wildcard) must be separated by at least one static segment, since an unanchored boundary between two unbounded segments would leave the first structurally empty. Variadic segments cannot carry a prefix or suffix. A route path supports at most three variadic segments.
