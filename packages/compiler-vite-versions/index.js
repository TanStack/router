/**
 * The Vite majors the router plugin's peer range admits besides the
 * workspace's, each loaded on demand (`vite6`, `vite7`: aliased packages of
 * this test-only package). Vite 5's latest release fails the workspace's
 * trust policy (no-downgrade) and is not installable.
 */
export const viteVersions = [
  { major: 6, load: () => import('vite6') },
  { major: 7, load: () => import('vite7') },
]
