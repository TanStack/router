---
'@tanstack/router-generator': patch
---

Scaffold plain TypeScript route files without JSX. When creating an empty `.ts` route file it previously broke every subsequent route tree generation. The React & Solid boilerplate templates include a JSX hello world component which threw a `SyntaxError: Missing semicolon` error when it was parsed by Babel, resulting in the file remaining empty on disk and the route tree not being re-generated.

`.ts` routes now scaffold a route with boilerplate that contains no JSX, `export const Route = createFileRoute('/api/foo')({})`. Vue is unchanged. Custom user scaffold will still fail generation if JSX is included.
