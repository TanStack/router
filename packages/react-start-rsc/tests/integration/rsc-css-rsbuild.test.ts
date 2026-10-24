/**
 * RSC CSS delivery (SPEC J7) through the real transport on Rsbuild: a React
 * Start app with RSC enabled on an Rsbuild dev server (`rsc-app.ts`, Start's
 * RSC layer with `react-server-dom-rspack`), whose server functions render
 * server components with the RSC helpers, and a real page that shows what
 * the browser makes of the Flight payload, including a render call in a
 * helper module the server function calls. The Vite counterpart, with the
 * whole matrix, is rsc-css.test.ts; the production build:
 * rsc-css-rsbuild-build.test.ts. The rows: `describeRscCssRows`
 * (rsc-css-rsbuild-app.ts).
 */
import { describeRscCssRows } from './rsc-css-rsbuild-app'

describeRscCssRows('dev')
