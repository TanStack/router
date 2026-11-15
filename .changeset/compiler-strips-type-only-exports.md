---
'@tanstack/router-utils': patch
'@tanstack/router-plugin': patch
'@tanstack/start-plugin-core': patch
---

Route splitting and Start's removal of server-only code no longer leave a type-only export behind for a type whose import they removed (`import { db, type Row } from './db'` with `export type { Row }`). A Babel plugin running after TanStack's (React Compiler through `@rolldown/plugin-babel` or `@vitejs/plugin-react`) failed the build with "Export 'Row' is not defined". Type-only exports have no runtime meaning, so the compiler removes them from every module it emits, as it did before the compiler rewrite: `export type { X }`, `export type { X } from '…'`, `export type * from '…'` and the `type X` specifiers of an `export { … }`, keeping the value specifiers next to them. Type declarations (`export type X = …`, `export interface X`) stay as written.
