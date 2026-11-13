---
'@tanstack/start-plugin-core': patch
'@tanstack/router-utils': patch
---

`<Hydrate>` fixes and refusals:

- Solid: a split handler of several statements without semicolons whose statements start with a call of a component local (`setCount(…)` then `setOpen(true)`) no longer runs as one call chain.
- Solid: `ref={el!}`, `ref={el as T}` and `ref={(el)}` in split children assign the component's `let`, as `ref={el}` does.
- React: a function in split children that reads a `let` the component reassigns now fails the build at the read, naming the variable: the split children receive its value when the boundary renders, so the function would not see later assignments. Keep the value in a ref (`useRef`), or use `split={false}`. Solid reads such a variable through a getter and is unaffected.
- The deferred hydration guide now lists every pattern that fails the build. Two of them built before and miscompiled silently: assigning a local of the component inside the boundary, and assigning a module-level variable the rest of the module also uses. Also refused: `await`/`yield` directly in the children, `new.target`, reading at module evaluation a binding later top-level code changes, and (Solid) a nested boundary assigning an outer local through `ref`.
