---
'@tanstack/history': patch
---

Prevent open redirects via backslash protocol-relative URLs. `sanitizePath` only collapsed leading forward slashes, but browsers treat backslashes as forward slashes in the authority, so hrefs like `\\evil.com`, `/\evil.com` and `\/evil.com` bypassed the guard. Leading runs of two or more slashes/backslashes are now collapsed to a single slash.
