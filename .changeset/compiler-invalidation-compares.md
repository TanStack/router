---
'@tanstack/router-utils': minor
---

The compiler's file-event invalidation compares the file with what its caches read: a save that leaves a file as it was (a touch, an echo of the same event through a second hook) re-plans nothing, a repeated call waits for the first and changes nothing, and an event delivered late is judged by the file as it is. The modules each environment's bundler must build again (stale dependents, a registry change's file, a compile that kept being overtaken) are kept per environment until the host takes them.
