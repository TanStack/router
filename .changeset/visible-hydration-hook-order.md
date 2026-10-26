---
'@tanstack/react-start-client': patch
---

Fix `<Hydrate when={visible()}>` intermittently throwing React #467 ("Update hook called on initial render") and falling back to client rendering when the boundary becomes visible while React replays its suspended mount.
