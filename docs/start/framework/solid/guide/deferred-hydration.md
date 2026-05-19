---
ref: docs/start/framework/react/guide/deferred-hydration.md
replace:
  '@tanstack/react-start': '@tanstack/solid-start'
  'React handlers': 'Solid handlers'
  'one React tree': 'one Solid tree'
  'ReactNode': 'JSX.Element'
  "Deferred hydration is a performance hint for React's initial hydration work. React may hydrate a deferred boundary earlier than its strategy would normally allow if state, props, context, or store updates outside the boundary require React to reconcile inside it before the gate opens. This preserves correctness and avoids showing stale server HTML after the surrounding app has changed.": "Deferred hydration is a performance hint for Solid's initial hydration work. Once a boundary gate opens, TanStack Start clears the preserved server DOM inside the marker and mounts the live Solid subtree in its place."
  'Hook calls directly inside extracted JSX': 'Render-time `use*` calls directly inside extracted JSX'
  'Moving that JSX would move where the hook executes.': 'Moving that JSX would move where the call executes.'
  'Move the hook call into a component inside the boundary, then render that component.': 'Move the call into a component inside the boundary, then render that component.'
  'Move the hook into a component instead:': 'Move the call into a component instead:'
---
