---
'@tanstack/solid-router': patch
---

Stop installing intent-preload listeners on `<Link>` when intent preloading is off.

`useLinkProps` handed out `onFocus`/`onBlur`/`onMouseEnter`/`onMouseLeave` (and the
mouse-over/out/touch-start pair) unconditionally, with the `preload() !== 'intent'`
check living _inside_ each handler. Solid does not delegate `mouseenter`,
`mouseleave`, `focus` or `blur`, so every anchor installed four real listeners that
did nothing but return — on a list view that is four per row (a 165-row board
measured 660 listeners whose only job was to bail).

The handlers are now resolved through getters: with intent preloading off the
property yields whatever the consumer passed (or `undefined`, which `spread()`
treats as removal), and nothing is attached. Behaviour is unchanged — the getters
stay reactive, so flipping `preload` back to `'intent'` re-runs the consuming
spread and attaches the composed handler.
