---
'@tanstack/start-plugin-core': patch
---

Import protection: when one importer needs a denied file as it is (an exempt plain importer, or an import `allowImport` allows) and a checked module reaches the file itself (a pattern import such as `import.meta.glob`, or an import another plugin added), the build now fails on Vite and Rsbuild under both behaviors, whatever order the bundler compiled them in: one file can't be both its mock and itself. The error names the file, each importer and why, and the two fixes (leave the file out of the pattern, or narrow the exemption or `allowImport`). Dev servers print the same error and keep serving the file until it is fixed.

An importer the app no longer imports, a removed split-out route component, or a removed import `allowImport` allowed no longer keeps a denied file as it is in `build --watch` and the Rsbuild dev server: the next compilation serves its mock. Warnings about an exempt pattern importer now say where its pattern import is.
