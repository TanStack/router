/**
 * The Solid `<Hydrate>` page tests (`hydrate-pages-solid.ts`) on an app
 * built with Start's Rsbuild plugin, `@rsbuild/plugin-babel` and
 * `@rsbuild/plugin-solid` (a production build: see `hydrate-pages.ts`).
 */
import { solidPageSuite } from './hydrate-pages-solid'

solidPageSuite('rsbuild')
