---
'@tanstack/router-core': patch
---

Hydrate the URL the document was loaded from when the browser history moves to another entry before hydration (for example, Back pressed while the client is still loading), then load the current location. Previously the server markup was hydrated as the new location's routes, which left the old page on screen with the new one rendered below it.
