---
'@tanstack/solid-router': patch
---

Solid Links rendered as plain anchors in the browser bind their own attributes and event handlers directly instead of spreading a merged props object, which makes mounting and updating many Links faster. Element props, active/inactive props and event handler composition behave as before.
