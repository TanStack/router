---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/router-generator': patch
'@tanstack/start-plugin-core': patch
---

Compiler messages from the diagnostics audit:

- A server function in a JavaScript `<script setup>` block of a Vue SFC is refused with the `<script setup>` explanation and its position in the SFC in a default Vite build too (no source maps), as with `lang="ts"` and on Rsbuild.
- A `<Hydrate>` boundary refused because its chunk would assign a module-level variable names the variable, and the component outside the boundary that assigns it when the children only render that component. The message gives one reason (the chunk would assign its own copy, or an import) and the fixes that work: `split={false}`, or the variable moved to a module of its own with a function that assigns it.
- A server function refused inside a function gives the function as the cause, whatever it reads; what it reads (a local, a local builder, `this`, `await`) decides the fix.
- Wording: invalid `codeSplitGroupings` in a route file, one `deleteNodes` option ("is not removed"), a route file that stops parsing in dev, and the import-protection marker conflict.
- webpack and Rspack report an error of a route file once, not once more for each of its split chunks.
