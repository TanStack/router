---
'@tanstack/router-plugin': patch
---

Split object-form loader handlers and strip lifecycle codecs only when the lifecycle object is inline. Keep opaque loader values eager so imported and helper-returned loaders retain their runtime metadata.
