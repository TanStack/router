---
'@tanstack/start-client-core': patch
---

perf: drop consumed chunks from the client frame decoder buffer with an O(1) head pointer instead of `Array.prototype.shift()` (O(n)). The previous approach degraded to O(n²) when a single large frame (e.g. a big `RawStream` payload) was assembled from many small network reads.
