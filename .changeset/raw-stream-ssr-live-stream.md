---
'@tanstack/router-core': patch
---

Serialize `RawStream` values in SSR hydration data through a Seroval live stream. The server now reads the next chunk only after the record for the previous one was accepted, so a large `RawStream` no longer keeps its whole encoded contents in memory until serialization completes, and the browser-side stream keeps no replay buffer once the router's factory subscribes. Disposing the SSR serialization now forwards the dispose reason to the source stream's `cancel`.
