---
'@tanstack/router-plugin': minor
'@tanstack/router-utils': minor
'@tanstack/start-plugin-core': patch
---

Route code splitting keeps the rules of the Babel splitter:

- **The same options are split.** `component`, `errorComponent`, `pendingComponent`, `notFoundComponent` and `loader`, as your groupings say. An option whose value the route file exports (`export function PostsComponent`) stays in the route module, and the build warns once, naming the file and the exports, as before. Root routes are not split.
- **Code only one split option uses moves into its chunk**, its initialiser included; what several options read (a staying one included) is one shared module, as before, unless it reads `Route`: then each chunk has its own copy. Assigning is not reading: a `let` one option only assigns and a split option reads is two variables, as before.
- **Only what splitting made unused leaves the route module.** A declaration or import that only moved code used (a use in a type counts) is removed when nothing left reads it. Top-level statements stay, and so does code that was already unused: `const unused = register('x')` stays in the route module only and runs once (the Babel splitter's chunks each ran it again); an import nothing uses (`import './polyfill'`, a CSS file) runs with the route file at the same point, once (in the shared module when there is one). React's classic JSX runtime is not supported with code splitting.
- **Values the Babel splitter could not move into a chunk keep working.** A member access (`pages.Home`), `satisfies`, a class, a namespace member, an array-pattern binding, a sequence, an object-form loader, a call holding JSX or TypeScript syntax (`memo(() => <p />)`), and an option whose chunk would assign a variable it shares with the route module or another chunk stay in the route module, where they work, instead of failing the build.
