---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Route compiler and generator messages fire only when there is something to fix, and say how:

- Every message names files relative to the project root and carries one position on every host: line and column counted from 1 in Vite builds (which printed none), Rsbuild, Rspack and webpack; the Vite dev server keeps its own `File:` line, mapped to the file as written. Rsbuild no longer prints the path three times, and a custom server function id error is reported once, not once per environment.
- Invalid split groupings fail the module at the value, naming the option; invalid plugin options fail with one readable error instead of a raw schema dump.
- A route tree the generator cannot build (two files for one route, conflicting paths, a missing root route) now fails `tsr generate` and builds, naming the files, instead of building with the tree on disk. Dev and watch mode print the error and keep the last good tree.
