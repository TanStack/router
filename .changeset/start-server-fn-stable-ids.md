---
'@tanstack/start-plugin-core': minor
---

Server function ids are now derived from the function's stable name, and default production ids are shorter (22 characters).

- **Every production server function id changes.** Update CDN rules, WAF allowlists, analytics keyed by id and native clients that call `/_serverFn/<id>` directly. Browser tabs loaded before a deploy fail their next server-function call after it: plan a reload or a blue/green window.
- **`serverFns.generateFunctionId` receives the function's stable name** (`greetUser`) as `functionName`, not the generated handler name (`greetUser_createServerFn_handler`). Custom generators keyed on the old names must be updated.
