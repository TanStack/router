---
'@tanstack/start-client-core': patch
---

perf: zero-copy frame payload extraction in the client frame decoder. When a frame's bytes are fully contained in the first buffered chunk (the common case), return a subarray view instead of allocating a new buffer and copying. This is on the hot path for decoding streamed server-function responses and `RawStream` payloads.
