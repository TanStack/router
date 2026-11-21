---
'@tanstack/start-plugin-core': patch
---

`<Hydrate>`:

- **Through the app's own re-exports** (`export { Hydrate } from '@tanstack/react-start'`, an imported `Hydrate` exported again, `export *`, a namespace import, chains of these), `<Hydrate>` splits its children like a direct import, in React and Solid, on Vite and Rsbuild; its children's code loaded with the page. A re-export under another name, or one from an installed package, isn't followed.
- **Solid:** children that call `use*()` functions directly are split; the calls run under the boundary's owner, with its context. They failed the build.
- **React:** the hook refusal now covers member calls too: a child calling `React.useId()` or `Route.useLoaderData()` directly fails the build like one calling `useId()`. Move the call into a child component, or use `split={false}`.
- **React:** so does React's `use` written directly in the children, `use(Context)` and `use(promise)` alike (also renamed, or as `React.use`): moved into the split component, `use(Context)` read another context than on the server. The error points at the call, for every hook.
- **New refusals**, where the split children would run on a copy or a snapshot (the build fails at the code; `split={false}` keeps the boundary in place):
  - React: a function in the children that reads a `let` the component reassigns, also through a nested `<Hydrate>`. Keep the value in a ref (`useRef`).
  - Children that assign a local of the component, or a module-level variable other code of the module also uses. The message names the variable; move it to a module of its own, with a function that assigns it.
  - `new.target` in the children, and (Solid) a nested boundary assigning an outer local through `ref`.
- `await` or `yield` directly in the children, and a read of a private name of the class around the boundary (`this.#label`), fail the build with a message instead of a parse error. The deferred hydration guide lists every pattern that fails the build.
- **On the server, a hook call whose value only a `fallback` reads** is removed with the imports only it uses, in every file; outside a route's split component it was kept. A hook that needs the browser (`useState(() => window.innerWidth)`) no longer fails the server render there. A hook that takes an id (`useId`, Solid's `createUniqueId`, or a custom hook that calls one) shifts the ids after it on the server, as with `<ClientOnly>` children: call such a hook in a component inside the boundary.
