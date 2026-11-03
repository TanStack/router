---
'@tanstack/router-core': patch
---

Fix `parseLocation` leaving a non-canonical search string on `publicHref`. With any rewrite configured, landing on a url whose search is not in the router's canonical form (`?q=a%2Ab`, `?q=two%20words`, `?a=1&&b=2`) produced a `publicHref` that disagreed with the one `buildLocation` builds for the same location, so the transitioner committed a location change and re-ran every matched loader right after hydration — invisibly, with no navigation and no address bar change. Only the query component is re-stringified; the path and hash are untouched.
