/**
 * The route generator on a running Vite dev server, on a real page: route
 * files created, renamed, moved and deleted keep their `createFileRoute`
 * path in line with their location, the live routes follow, and each route's
 * component loads on navigation (scenarios: `generator-dev-scenarios.ts`;
 * the Rsbuild counterpart is rsbuild-dev-server-generator.test.ts).
 */
import { describeRouteFileUpkeep } from '../generator-dev-scenarios'

describeRouteFileUpkeep('vite')
