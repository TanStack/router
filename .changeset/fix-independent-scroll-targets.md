---
'@tanstack/router-core': patch
---

fix(router-core): handle window and element scroll restoration independently

Window and element scroll targets are now handled independently. Restoring one target no longer suppresses resets for other uncached configured targets, and a restored element is no longer reset when the window has no cached position.

Hash navigation no longer resets elements configured through `scrollToTopSelectors` and retains precedence over stale window positions through destination invalidations.

Scroll positions are sampled when leaving a route, preserving live changes made after the most recent scroll event. This also prevents client hydration from undoing nested positions restored by the SSR script.

Fixes #7687.
