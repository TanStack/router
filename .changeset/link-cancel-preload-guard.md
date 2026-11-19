---
'@tanstack/react-router': patch
---

`Link` only calls `clearTimeout` when a delayed preload is pending. Unmounting, clicking, blurring or leaving a link no longer touches timers when no preload timer was started.
