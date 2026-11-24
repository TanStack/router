---
ref: docs/start/framework/react/guide/deferred-hydration.md
replace:
  '@tanstack/react-start': '@tanstack/solid-start'
  'one React tree': 'one Solid tree'
  "existing DOM to\nReact\\.": "existing DOM to\nSolid."
  '`Reviews` React': '`Reviews` Solid'
  'Comparison To React Selective Hydration': 'Comparison To Solid Streaming Hydration'
  'ReactNode': 'JSX.Element'
---

[//]: # 'SelectiveHydration'

Solid's streaming hydration controls the order in which server-rendered
boundaries hydrate. Deferred hydration controls whether and when each
boundary hydrates at all.

When Solid hydrates a streaming SSR page, every server-rendered
`<Suspense>` boundary will eventually hydrate. Streaming hydration just
decides the order: each boundary hydrates as its resources resolve and
stream from the server. The work is fixed by what the server rendered;
Solid streams it to feel responsive.

[//]: # 'SelectiveHydration'
[//]: # 'HydrationCompose'

The two compose. A `Hydrate` boundary decides whether and when Solid
starts hydrating a subtree; once it opens, anything inside it (including
`<Suspense>` boundaries) flows back into Solid's normal hydration
scheduler. Use `<Suspense>` when hydration must happen and you want Solid
to prioritize it well. Use `Hydrate` when hydration might not need to
happen at all.

[//]: # 'HydrationCompose'
[//]: # 'InlineCallbacks'

Inline `when` and `prefetch` functions are supported. A Solid component runs
once: the boundary reads `when` when it is created. To change the strategy of a
mounted boundary, render a new boundary, for example inside a keyed `<Show>`.

[//]: # 'InlineCallbacks'
[//]: # 'EarlyHydration'

Deferred hydration is a performance hint for Solid's initial hydration work.
Once a boundary gate opens, TanStack Start clears the preserved server DOM
inside the marker and mounts the live Solid subtree in its place.

[//]: # 'EarlyHydration'
[//]: # 'SplitLimits'

These patterns cannot be split:

| Pattern                                                                                                                                    | Why it is rejected                                                                          | What to do instead                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Function-as-children                                                                                                                       | The compiler cannot move a render function and preserve the expected call pattern.          | Use `split={false}` or move the rendered UI into a child component.                                                 |
| Assigning a local of the component inside the boundary (`count++`)                                                                         | The extracted children receive the local's value, not the variable.                         | Move the variable and the code that assigns it into a component inside the boundary, or use `split={false}`.        |
| A nested boundary assigning, through `ref`, a local declared outside both boundaries                                                       | The inner boundary's chunk would assign its own copy.                                       | Use `split={false}` on one of them.                                                                                 |
| Children, or a component only they render, assigning a module variable other code uses, `ref={el}` included (unless `el` holds a callback) | The chunk would assign its own copy of the variable, while the module reads the original.   | Use `split={false}`, or move the variable to a module of its own, with a function that assigns it, and import them. |
| `await` or `yield` directly inside the boundary                                                                                            | The extracted children render in a synchronous component.                                   | Compute the value before the boundary, or use `split={false}`.                                                      |
| `this` or `new.target` captures                                                                                                            | Extracted function components cannot safely preserve class instance or constructor context. | Wrap the UI in a function component or use `split={false}`.                                                         |
| The enclosing function's `arguments`                                                                                                       | The extracted children render in another component, with arguments of their own.            | Read it into a local before the boundary (`const args = arguments`), or use `split={false}`.                        |
| `super` captures                                                                                                                           | Extracted function components cannot preserve superclass access.                            | Wrap the UI in a function component or use `split={false}`.                                                         |

[//]: # 'SplitLimits'
