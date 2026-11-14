---
'@tanstack/router-plugin': minor
'@tanstack/router-utils': minor
'@tanstack/start-plugin-core': patch
---

Route code splitting keeps the rules of the Babel splitter, with module state shared once:

- **The same options are split.** `component`, `errorComponent`, `pendingComponent`, `notFoundComponent` and `loader`, as your groupings say. An option whose value the route file exports (`export function PostsComponent`) stays in the route module, and the build warns once, naming the file and the exports, as before. Root routes are not split.
- **Code only one split option uses moves into its chunk**, its initialiser included; code several split options use is one shared module they import.
- **State exists once, and top-level code runs once.** A value the route module keeps (one its `loader` reads, an export, `Route`) is imported by the chunks that read it instead of copied into them, and top-level statements (`Sentry.init()`, `registry.set(…)`, an `if` block) run once, in the route module, instead of again in each chunk.
- **Values the Babel splitter could not move into a chunk keep working.** A member access (`pages.Home`), `satisfies`, a class, a namespace member, an array-pattern binding, a sequence, an object-form loader, a call holding JSX or TypeScript syntax (`memo(() => <p />)`), and an option whose chunk would assign a variable the route module also uses stay in the route module, where they work, instead of failing the build.
