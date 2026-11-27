import { physical, rootRoute, route } from '@tanstack/virtual-file-routes'

// Two physical() mounts with the same file layout under different parents
// must not share generated variable names.
export const routes = rootRoute('__root.tsx', [
  route('/accounts', [physical('', 'accounts')]),
  route('/billing', [physical('', 'billing')]),
])
