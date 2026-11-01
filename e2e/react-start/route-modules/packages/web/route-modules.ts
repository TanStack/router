/**
 * The route modules the store installs, shared by the Vite and the Rsbuild
 * configuration. `tests/workspace.ts` mirrors it for the generation tests.
 */
export const routeModules = {
  includes: [
    { module: '@start-route-modules/catalog', at: '/shop' },
    { module: '@start-route-modules/notes', at: '/notes' },
    {
      module: '@start-route-modules/team',
      parent: '/orgs/$orgId',
      at: '/team',
    },
    // Installed twice: per organization and per person.
    {
      module: '@start-route-modules/settings',
      parent: '/orgs/$orgId',
      at: '/settings',
      as: 'orgSettings',
    },
    {
      module: '@start-route-modules/settings',
      parent: '/people/$personId',
      at: '/settings',
      as: 'personSettings',
    },
  ],
}
