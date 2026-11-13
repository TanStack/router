// Files and edits of the soak scenario (see run.mjs `soakRun`).
//
// The soak adds a `/soak` route and a few modules to the generated app (only
// for the soak's dev server; the workload hash of the other scenarios is
// unchanged) and rotates over edit kinds, each one an edit and its revert:
//
// - probe edits (`route-component`, `route-loader`, `shared-component`,
//   `server-fn`, `hydrate`): the HMR probes of generate.mjs
// - `module-add`: a new module, imported by the soak route instead of
//   `src/soak/value.ts`; then the import is restored and the module deleted
// - `route-add`: a new route file (route tree regenerated), visited, deleted
// - `route-rename`: `src/routes/soak/renamed.tsx` renamed (unlink + add) to a
//   new name, visited, renamed back
// - `server-import` (Start): an import of `src/server/secrets.server.ts` added
//   to the soak route, alternately read by a server function handler (the
//   client drops it) and by client code (an import-protection violation,
//   mocked in dev); then removed
// - `factory-flip` (Start): `src/soak/factory.ts` stops/starts exporting a
//   server-function builder; only its importer's output changes (a
//   dependency-only edit, through the compiler's export-facts digests)
//
// Every name is a function of the cycle index, so a record run and a replay
// run (floor) see the same file contents.

import { isStart } from './generate.mjs'

const routeHeader = (fw) =>
  `import { createFileRoute } from '@tanstack/${fw}-router'\n`

export const SOAK_ROUTE = 'src/routes/soak/index.tsx'
export const SOAK_FACTORY = 'src/soak/factory.ts'
export const SOAK_RENAMED = 'src/routes/soak/renamed.tsx'

/**
 * The soak route. `variant.importFrom`: the module its value comes from;
 * `server`: 'handler' | 'client' | null adds the `*.server.ts` import.
 */
export function soakRouteSource(
  variant,
  {
    importFrom = '../../soak/value',
    server = null,
    label = 'soak-label-v0',
  } = {},
) {
  const start = isStart(variant)
  const lines = [
    routeHeader('react'),
    `import { soakValue } from '${importFrom}'\n`,
  ]
  if (start) {
    lines.push(`import { soakFn } from '../../soak/uses-factory'\n`)
  }
  if (server) {
    lines.push(`import { readSecret } from '../../server/secrets.server'\n`)
    if (server === 'handler') {
      lines.push(`import { createServerFn } from '@tanstack/react-start'\n`)
    }
  }
  lines.push(`
export const Route = createFileRoute('/soak/')({
  component: SoakPage,
})
`)
  if (server === 'handler') {
    lines.push(`
const soakSecret = createServerFn({ method: 'GET' }).handler(async () =>
  readSecret('SOAK_SECRET'),
)
`)
  }
  const onClick =
    server === 'handler'
      ? `() => void soakSecret()`
      : server === 'client'
        ? `() => console.log(readSecret('SOAK_SECRET'))`
        : `() => console.log('soak')`
  lines.push(`
function SoakPage() {
  return (
    <div className="route" data-route="/soak">
      <p data-probe="soak-module">{soakValue}</p>
      <p data-probe="soak-label">${label}</p>
${
  start
    ? `      <p data-probe="soak-factory">
        {String(soakFn).includes('factory-body') ? 'factory-plain' : 'factory-rpc'}
      </p>
`
    : ''
}      <button type="button" onClick={${onClick}}>
        Soak
      </button>
    </div>
  )
}
`)
  return lines.join('')
}

export function soakFactorySource(builder) {
  return builder
    ? `import { createServerFn } from '@tanstack/react-start'

export const soakFactory = createServerFn
`
    : `export const soakFactory = (_options?: unknown) => ({
  handler: <T,>(fn: T): T => fn,
})
`
}

export function soakChildRoute(routePath, text) {
  return `${routeHeader('react')}
export const Route = createFileRoute('${routePath}')({
  component: () => <p data-probe="soak-route">${text}</p>,
})
`
}

/** Files the soak adds to the app before the dev server starts. */
export function soakSetupFiles(variant) {
  const files = new Map([
    [SOAK_ROUTE, soakRouteSource(variant)],
    ['src/soak/value.ts', `export const soakValue = 'soak-value-v0'\n`],
    [SOAK_RENAMED, soakChildRoute('/soak/renamed', 'soak-renamed')],
  ])
  if (isStart(variant)) {
    files.set(SOAK_FACTORY, soakFactorySource(true))
    files.set(
      'src/soak/uses-factory.ts',
      `import { soakFactory } from './factory'

export const soakFn = soakFactory({ method: 'GET' }).handler(async () => {
  return 'factory-body'
})
`,
    )
  }
  return files
}

/** The edit kinds of a variant, in rotation order. */
export function soakKinds(variant, probes) {
  const kinds = [
    'route-component',
    'module-add',
    'route-loader',
    'route-add',
    'shared-component',
    'route-rename',
  ]
  if (isStart(variant)) {
    kinds.push('server-fn', 'server-import', 'hydrate', 'factory-flip')
  }
  return kinds.filter(
    (k) =>
      ![
        'route-component',
        'route-loader',
        'shared-component',
        'server-fn',
        'hydrate',
      ].includes(k) || probes[k],
  )
}
