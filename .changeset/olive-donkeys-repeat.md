---
'@tanstack/router-core': patch
'@tanstack/start-client-core': patch
---

Format Standard Schema validation issues instead of running them through `JSON.stringify`. An issue can carry a value that cannot be serialized, such as a bigint or a circular reference, which threw and hid the real failure, and the resulting blob buried the messages. Server-function validation and router search validation now share one formatter that reports each issue as `path: message`, quoting any key that is not a plain identifier so `['a', 'b']` and `['a.b']` stay distinct.

Fixes #7779
