---
'@tanstack/start-plugin-core': patch
---

Skip the Rsbuild import-protection loader and its plugins when import protection is disabled, so modules no longer pass through the loader.
