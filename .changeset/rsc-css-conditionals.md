---
'@tanstack/start-plugin-core': minor
---

RSC CSS: a server component passed to `renderServerComponent`, `createCompositeComponent` or `renderToReadableStream` through `?:`, `&&`, `||` or `??` carries its CSS on each operand that can be the JSX rendered; only a JSX argument written directly carried it.
