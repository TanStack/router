/**
 * The route asset rows (`route-assets-cases.ts`, SPEC J2.22, J5.6, J5.7) in
 * an Rsbuild production build, with and without `"sideEffects": false`
 * (without it, Rspack keeps every export another module imports through the
 * route file with the entry: SPEC J2.8).
 */
import { routeAssetsSuite } from './route-assets-cases'

routeAssetsSuite('rsbuild')
routeAssetsSuite('rsbuild', false)
