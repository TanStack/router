---
'@tanstack/start-client-core': patch
---

Server function calls now reject when a response is untagged and not JSON, instead of returning the `Response` object as the function's result. An untagged response did not come from the server-functions handler — something between the browser and the server answered the request instead (a reverse proxy, a bot challenge, a captive portal) — so the body is surfaced as an error, matching how untagged non-JSON error responses are already handled.
