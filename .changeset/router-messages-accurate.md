---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Route compiler and generator messages fire only when there is something to fix, and say how:

- An exported declaration the route module needs anyway (its `loader` reads it, the split component reaches it through `Route`) is no longer reported as staying in the route module. A component declared on its own that writes state the loader reads, and a declaration reading state the module writes at load, are now reported.
- The "loads with the entry chunk" warning is only printed when there is a cost: a copied function that ships twice, a re-export webpack or Rspack keep, or chunk configuration. Its fixes are the ones that work.
- Every message names files relative to the project root and carries one position on every host: line and column counted from 1 in Vite builds (which printed none), Rsbuild, Rspack and webpack; the Vite dev server keeps its own `File:` line, mapped to the file as written. Rsbuild no longer prints the path three times, and a custom server function id error is reported once, not once per environment.
- Invalid split groupings fail the module at the value, naming the option; invalid plugin options fail with one readable error instead of a raw schema dump.
- A route tree the generator cannot build (two files for one route, conflicting paths, a missing root route) now fails `tsr generate` and builds, naming the files, instead of building with the tree on disk. Dev and watch mode print the error and keep the last good tree.
