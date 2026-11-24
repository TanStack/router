---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Code the compiler moves out of a function (`<Hydrate>` children, a server function written inside a class or an object, a split route option) is checked against what it takes from around it by the language's own scoping, the same way in all three:

- **`<Hydrate>`**: `<this.Body />`, `this` in a nested class's computed key or in a parameter decorator, and a hook call in a class's computed key now fail the build, as `this` and hooks elsewhere in the children do. `typeof this` in a type no longer does. A class field reading a variable the component assigns later (`<W C={class { v = count }} />`) is refused like a function reading it.
- **`<Hydrate>`**: reading the enclosing function's `arguments` in the children now fails the build, at the `arguments`. Read it into a local before the boundary (`const args = arguments`), or use `split={false}`.
- **`<Hydrate>`, React**: a function in the children may read a `let` the component assigns, when every assignment is an ordinary statement of the component before the boundary (also in `if`/`else`, `switch` or `try` blocks) and the boundary is not in a loop or a callback: it reads the value assigned. It failed the build.
- **Solid**: `ref={el}` on a `let` counts as an assignment of `el`, unless `el` holds a callback that no code kept in that output reassigns (Solid then calls it). A split handler reading an element a ref outside the boundary sets later now sees it; children naming a module-level `let` by ref fail the build instead of setting a copy the module never reads; a split route component whose ref names a module `let` that `beforeLoad` reads stays in the route module.
- **Server functions in a class**: `this` in a nested class's computed key or as a JSX tag, and a private name an inner class does not declare, fail the build at the code; a member or key named `arguments` and `typeof this` no longer do. A function called in place in the chain that reads a declaration of its own statement fails the build instead of throwing when the module loads.
- **Route splitting**: a `function` loader whose nested class decorates a parameter with the loader's `this` stays in the route module with the `this` warning.
