---
'@tanstack/router-core': patch
'@tanstack/react-router': patch
---

Keep outgoing React Link active presentation at its latest presented location while navigation is pending. Links in retained routes and outside route ownership still update immediately, and all hrefs continue to follow the live location. Share the presentation store by owning route so retained Links are not notified again when navigation settles.
