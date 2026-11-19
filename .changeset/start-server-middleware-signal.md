---
'@tanstack/start-client-core': patch
---

The options of a function middleware's server function no longer declare `signal`. Start never set it there, so code that read it got `undefined`. The signal of the request is `getRequest().signal`.
