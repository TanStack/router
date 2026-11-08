---
'@tanstack/start-plugin-core': patch
'@tanstack/react-start-rsc': patch
---

Start compiler messages give a fix that works when applied, at the right position. Refusals in a Vue SFC's `<script setup>` block are reported at the SFC's line and column on Vite and Rsbuild, in builds and on the dev server, and say that the block's code runs inside the component's setup function: define the server function in a `.ts` module, write it as one chain, or pass the value in its input. The Vue recipe no longer suggests keeping a builder in a `<script>` block, which fails in development. A nested server function that cannot be hoisted names the local builder, the local it reads (with `.validator()` and `{ data }`), or the option call and the function it is in. A server function builder kept in an object or assigned after its declaration gets the documented fix (an exported `const` partial chain, a `const`). An RSC render outside a server function suggests `createServerOnlyFn` for helpers, and the client stubs of the RSC helpers no longer recommend a route loader (their explanation is now development-only). Argument checks name the method, the server-parameter warning says when it is harmless, and custom server function ids built from `filename` are told to hash it. Vite's late pass is labelled `tanstack-start:compiler-late`.

`<Hydrate>` on Solid splits children that call `use*` functions (Solid has no rules of hooks): the calls run under the boundary's owner, with its context. React keeps the hook refusal.
