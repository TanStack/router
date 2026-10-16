---
'@tanstack/router-core': patch
'@tanstack/start-server-core': patch
---

Render generated script preloads (`modulepreload`, or `preload as="script"` for IIFE output) with `fetchPriority="low"` and forward it into static Early Hints, so they no longer compete with render-blocking stylesheets, fonts and images.
