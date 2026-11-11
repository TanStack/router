---
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

React development output no longer predicts which components React Refresh keeps: split chunks and Hydrate chunks lose their `$$tsrRefreshId` statement, and React route modules lose the `unsplit` entry of their route HMR call (the runtime takes the new component after React Refresh's pass). Production output is unchanged.
