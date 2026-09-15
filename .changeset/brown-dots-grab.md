---
'@tanstack/react-router': patch
---

Skip unused Link preload cleanup when preloading is disabled, use timer-only cleanup for intent preloading, and ignore queued viewport notifications after their effect has been cleaned up.
