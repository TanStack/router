/**
 * The route generator on a running Rsbuild dev server (the router plugin's
 * Rspack entry, the real router bundled and run on a real page): route files
 * created, renamed, moved and deleted keep their `createFileRoute` path in
 * line with their location, the live routes follow, and each route's
 * component loads on navigation (scenarios: `generator-dev-scenarios.ts`;
 * the Vite counterpart is dev-server-generator.test.ts).
 */
import { describeRouteFileUpkeep } from '../generator-dev-scenarios'

describeRouteFileUpkeep('rsbuild')
