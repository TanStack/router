---
'@tanstack/start-plugin-core': patch
---

Two messages now see through every expression wrapper the compiler knows (`as`, `satisfies`, `!`, `<T>x`, `f<T>`, parentheses, optional chains):

- A builder assigned after its declaration to a cast of the variable or with `!` (`(base as any) = createServerFn()`, `base! = createServerFn()`) names the variable and suggests declaring it with the builder, as `base = createServerFn()` already did.
- Import protection: a browser-only component a server renders as a route option through an instantiation expression or an optional chain (`component: Widget<Props>`, `component: UI?.Widget`) now gets the `<ClientOnly>` fix (`<UI.Widget />` for the chain) instead of `createClientOnlyFn`, which throws while rendering on the server.
