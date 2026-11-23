/**
 * A package of a test app, written in one of the layouts package managers
 * give an installed dependency (step 0 of the node_modules policy):
 *
 * - `npm`: a directory of the app's `node_modules` (npm, Yarn, Bun hoisted);
 * - `pnpm`: a directory of pnpm's store (`node_modules/.pnpm/<name>@1.0.0/
 *   node_modules/<name>`), linked into `node_modules`;
 * - `workspace`: a workspace package outside `node_modules`
 *   (`packages/<name>`), linked into it;
 * - `alias`: an npm alias (`"<alias>": "npm:<name>@1.0.0"`): the directory
 *   is named after the key the app depends on, its manifest after the
 *   package.
 *
 * And the manifests a package declares Start in (or not).
 */

export type PackageLayout = 'npm' | 'pnpm' | 'workspace' | 'alias'
export const packageLayouts: ReadonlyArray<PackageLayout> = [
  'npm',
  'pnpm',
  'workspace',
  'alias',
]

/** How a package's manifest names Start (`declaration`). */
export type StartDeclaration =
  | 'peer'
  | 'optional-peer'
  | 'dependency'
  | 'optional-dependency'
  | 'start-server-core'
  | 'peer-meta-only'
  | 'none'

/** The manifest fields of a declaration of `@tanstack/react-start`. */
export function declarationFields(
  declaration: StartDeclaration,
  framework = 'react',
): Record<string, unknown> {
  const start = `@tanstack/${framework}-start`
  switch (declaration) {
    case 'peer':
      return { peerDependencies: { [start]: '*' } }
    case 'optional-peer':
      return {
        peerDependencies: { [start]: '*' },
        peerDependenciesMeta: { [start]: { optional: true } },
      }
    case 'dependency':
      return { dependencies: { [start]: '*' } }
    case 'optional-dependency':
      return { optionalDependencies: { [start]: '*' } }
    case 'start-server-core':
      return { dependencies: { '@tanstack/start-server-core': '*' } }
    case 'peer-meta-only':
      return { peerDependenciesMeta: { [start]: { optional: true } } }
    case 'none':
      return {}
  }
}

export interface TestPackage {
  /** The package's name (its manifest's). */
  name: string
  /** Its modules, by path relative to the package directory. */
  files: Record<string, string>
  declaration?: StartDeclaration
  /** More manifest fields (`sideEffects`, `exports`, …). */
  manifest?: Record<string, unknown>
}

export interface InstalledPackage {
  /** App files (the package's manifest and modules). */
  files: Record<string, string>
  /** App symbolic links. */
  symlinks: Record<string, string>
  /** The app's `dependencies` entry for it. */
  dependency: Record<string, string>
  /** The specifier the app imports it by. */
  importAs: string
  /** Its directory, relative to the app root, as the bundler names its modules (a real path). */
  directory: string
}

/** `pkg` installed in the app in `layout`. */
export function installPackage(
  layout: PackageLayout,
  pkg: TestPackage,
): InstalledPackage {
  const key = layout === 'alias' ? `${pkg.name}-alias` : pkg.name
  const directory = {
    npm: `node_modules/${pkg.name}`,
    pnpm: `node_modules/.pnpm/${pkg.name.replace('/', '+')}@1.0.0/node_modules/${pkg.name}`,
    workspace: `packages/${pkg.name.replace('/', '-')}`,
    alias: `node_modules/${key}`,
  }[layout]
  const manifest = {
    name: pkg.name,
    version: '1.0.0',
    type: 'module',
    exports: { '.': './index.js', './*': './*' },
    ...declarationFields(pkg.declaration ?? 'none'),
    ...pkg.manifest,
  }
  const files: Record<string, string> = {
    [`${directory}/package.json`]: JSON.stringify(manifest, null, 2),
  }
  for (const [file, code] of Object.entries(pkg.files)) {
    files[`${directory}/${file}`] = code
  }
  return {
    files,
    symlinks:
      layout === 'pnpm' || layout === 'workspace'
        ? { [`node_modules/${pkg.name}`]: directory }
        : {},
    dependency: {
      [key]: layout === 'alias' ? `npm:${pkg.name}@1.0.0` : '1.0.0',
    },
    importAs: key,
    directory,
  }
}

/** An app `package.json` depending on `packages`. */
export function appManifest(
  packages: ReadonlyArray<InstalledPackage>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: 'app',
    private: true,
    type: 'module',
    dependencies: Object.assign(
      { '@tanstack/react-start': '*' },
      ...packages.map((p) => p.dependency),
    ),
    ...extra,
  }
}
