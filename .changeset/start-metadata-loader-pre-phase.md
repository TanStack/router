---
'@tanstack/start-plugin-core': patch
---

Run the Rsbuild server function metadata loader right after the Start transform, before builtin SWC, so the metadata write no longer needs a second JS loader pass per module. Production module ids and chunk hashes change once because the loader chain is part of each module's identifier.
