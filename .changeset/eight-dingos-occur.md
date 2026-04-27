---
'@tanstack/react-start-rsc': patch
---

Re-export `RenderableServerComponent`, `RenderableServerComponentAttributes`, `RenderableServerComponentBuilder`, and `AnyRenderableServerComponent` from the package's public entries. Without these, consumers with `declaration: true` hit TS2742 on `renderServerComponent` calls and are forced to annotate handlers as `Promise<any>`.
