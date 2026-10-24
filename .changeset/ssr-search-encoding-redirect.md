---
'@tanstack/router-core': patch
---

Don't redirect an SSR request when its search only differs in percent-encoding. The request href is normalized with `URLSearchParams`, which encodes characters that are legal in a query, so a `stringifySearch` that emits them literally (comma-delimited arrays, for example) redirected to a href that normalized back to the incoming request forever.
