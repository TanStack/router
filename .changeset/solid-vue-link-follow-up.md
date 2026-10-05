---
'@tanstack/solid-router': patch
'@tanstack/vue-router': patch
---

Solid and Vue Links reuse the router's built destination across navigations and derive their state through fewer reactive nodes. Solid Links call a user `ref` once per element and create no reactive nodes on the server.
