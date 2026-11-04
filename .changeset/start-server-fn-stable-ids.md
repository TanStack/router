---
'@tanstack/start-plugin-core': minor
---

Default production server function ids are shorter (22 characters, a hash of the file and the function's variable name), and a custom id must be one URL path segment.

- **Every default production server function id changes.** Update CDN rules, WAF allowlists, analytics keyed by id and native clients that call `/_serverFn/<id>` directly. Browser tabs loaded before a deploy fail their next server-function call after it: plan a reload or a blue/green window. Ids from a custom `serverFns.generateFunctionId` stay the same.
- `serverFns.generateFunctionId` receives the same `functionName` as before, the generated handler name (`greetUser_createServerFn_handler`, then `_1`, `_2` for a name the file repeats). Characters of a name outside `A-Z`, `a-z`, `0-9`, `_` and `$` (a non-ASCII variable name) now become `_`, so an id that embeds the name is a valid URL path segment.
- An id a custom `serverFns.generateFunctionId` returns must be one URL path segment: ASCII letters, digits, `-`, `.`, `_`, `~` and `$`, not `.` or `..` (nor an empty string). Any other id fails the build with an error naming the file, the function and the id. Most such ids already failed at runtime, since the client puts the id in the URL unencoded: a `#` or `?` ended the path and a `/` cut the id short, so the call silently ran another server function of the file or none, and a space, control or non-ASCII character reached the server percent-encoded and matched no function. Ids with `%` or with other characters URLs allow (such as `:`, `@`, `+`, `=`, `,`, `;`, `!`, `*`, `(`, `)`, `&`) did reach the handler on Node, but proxies and servers may decode or rewrite them, so they now fail the build too: hash the inputs instead (the documented example does).
