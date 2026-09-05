---
'@tanstack/react-router': patch
---

Fix repeated `innerHTML` writes for unchanged styles and data scripts during React re-renders. This prevents unnecessary CSS parsing and Trusted Types errors during client navigation.
