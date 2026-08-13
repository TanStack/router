---
'@tanstack/react-router': patch
---

Stop `Navigate` from re-issuing its navigation on every render. The guard compared the props object by identity, which is fresh on every render, so a component that re-rendered while the destination was still pending superseded its own in-flight navigation and never committed it. The guard now compares the resolved destination.
