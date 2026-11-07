/**
 * The route asset rows (`route-assets-cases.ts`, SPEC J2.22, J5.6, J5.7) in
 * a Vite production build, with and without `"sideEffects": false`.
 */
import { routeAssetsSuite } from './route-assets-cases'

routeAssetsSuite('vite')
routeAssetsSuite('vite', false)
