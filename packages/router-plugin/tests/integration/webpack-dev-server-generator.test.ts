/**
 * The route generator on a running webpack dev server (`webpack-dev-server`
 * with the router plugin's webpack entry): the scenarios of
 * dev-server-generator.test.ts (Vite) and rsbuild-dev-server-generator.test.ts
 * (Rsbuild) through the router's webpack-family host.
 */
import { describeRouteFileUpkeep } from '../generator-dev-scenarios'

describeRouteFileUpkeep('webpack')
