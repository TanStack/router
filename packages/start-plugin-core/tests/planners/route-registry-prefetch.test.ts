/**
 * The `start-env` prefetch answers an import of `Route` from a route file
 * the registry lists as made by the router package's constructor from the
 * registry entry (a `route-registry` dependency of the plan) instead of the
 * file's summary: a route tree importing every route reads none of them. A
 * route the registry calls foreign is read, and a registry change re-plans
 * the importer.
 */
import { describe, expect, it } from 'vitest'
import { invalidate } from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../../src/compiler/recognizer'
import { START_ENV, startEnvPlanner } from '../../src/planners'
import { MemoryHost, clientEnv } from './memory-host'
import type { StartEnvConfig } from '../../src/planners'
import type { HostServices } from '@tanstack/router-utils/compiler'

const TREE = '/app/src/routeTree.gen.ts'
const OWN = '/app/src/routes/own.tsx'
const FOREIGN = '/app/src/routes/foreign.tsx'

const files = {
  [TREE]: `import { Route as OwnRoute } from './routes/own'
import { Route as ForeignRoute } from './routes/foreign'
export const routeTree = [OwnRoute.update({}), ForeignRoute.update({})]
`,
  [OWN]: `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/own')({ component: () => 'own' })
`,
  [FOREIGN]: `import { createServerFn } from '@tanstack/react-start'
export const Route = createServerFn()
`,
}

const config = {
  configKey: 'cfg',
  perPlanner: {
    [START_ENV]: {
      framework: 'react',
      root: '/app',
      providerSeparate: false,
      idMode: 'dev',
    } satisfies StartEnvConfig,
  },
}

function setup(routerConstructor: Record<string, boolean>) {
  const memory = new MemoryHost(files, { recognizer: startRecognizer() })
  const reads: Array<string> = []
  const entries = { ...routerConstructor }
  const routes: NonNullable<HostServices['routes']> = {
    lookup: (path) =>
      path in entries
        ? { routeId: path, routerConstructor: entries[path]! }
        : null,
    digestFor: (path) =>
      path in entries
        ? `${path}:${entries[path] ? 'router' : 'foreign'}`
        : null,
  }
  const host: HostServices = {
    resolve: (specifier, importer) => memory.resolve(specifier, importer),
    rawFacts: memory.rawFacts,
    routes,
  }
  const original = memory.readFile.bind(memory)
  memory.readFile = (path) => {
    reads.push(path)
    return original(path)
  }
  const planners = [startEnvPlanner()]
  return { memory, host, reads, entries, planners }
}

describe('a route file the registry vouches for', () => {
  it('answers the own route from the registry and reads only the foreign one', async () => {
    const t = setup({ [OWN]: true, [FOREIGN]: false })
    const { compileModule } = await import('@tanstack/router-utils/compiler')
    const out = await compileModule(
      {
        id: TREE,
        code: files[TREE],
        env: clientEnv,
        planners: t.planners,
        config,
        wantMap: false,
      },
      t.host,
      t.memory.caches,
    )
    expect(t.reads).not.toContain(OWN)
    expect(t.reads).toContain(FOREIGN)
    // the foreign route exports an open server fn: the tree is a client module that reads it
    expect(out).not.toBeNull()
    const kinds = out!.persisted!.dependencies.map((d) =>
      d.kind === 'route-registry' ? `registry:${d.path}` : d.kind,
    )
    expect(kinds).toContain(`registry:${OWN}`)
    expect(kinds).toContain('summary')

    // the generator reports the own route's constructor as foreign now: the
    // tree's plan is stale, and its next compile reads the file
    t.entries[OWN] = false
    const res = await invalidate(
      t.memory.caches,
      { path: OWN, kind: 'registry' },
      t.host,
    )
    expect(res.dependents.map((k) => k.canonicalId)).toContain(TREE)
    await compileModule(
      {
        id: TREE,
        code: files[TREE],
        env: clientEnv,
        planners: t.planners,
        config,
        wantMap: false,
      },
      t.host,
      t.memory.caches,
    )
    expect(t.reads).toContain(OWN)
  })
})
