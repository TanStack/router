---
'@tanstack/start-plugin-core': minor
---

A server function id that a custom `serverFns.generateFunctionId` returns and that never worked over HTTP now fails the build, with an error naming the file, the function and the id: whitespace, a control or non-ASCII character, any of `"`, `#`, `/`, `<`, `>`, `?`, `\`, `^`, `` ` ``, `{`, `}`, the ids `.` and `..`, and a percent-encoding the server reads as another id (`%41`, lowercase hex, `%2E`) or rejects. The client puts the id in the URL unencoded, so a `#` or `?` ended the path and a `/` cut the id short (the call silently ran another server function of the file or none), and the other characters reached the server percent-encoded and matched no function. An id embedding a non-ASCII `functionName` is one of these. One case did work and now fails the build: such an id on a server function only SSR code called.

Ids with `%` or the other characters URLs allow (such as `:`, `@`, `+`, `=`, `,`, `;`, `!`, `*`, `(`, `)`, `&`, `'`, `|`, `[`, `]`) still build and reach their handler, with a deprecation warning (from the Vite plugin; the Rsbuild plugin does not print compiler warnings yet): the next major version rejects them, since proxies and servers may decode or rewrite them (hash the inputs instead, as the documented example does). An id with `'` no longer breaks the server bundle.
