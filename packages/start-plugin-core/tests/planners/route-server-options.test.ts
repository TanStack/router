/**
 * The route options Start erases from client route modules (`server`,
 * `headers`, `ssr`) are server-only text of the client compile: the router
 * planner records them for the server-code check (R132), so a client output
 * that kept one fails the compile. A planner that hoists an erased option's
 * value into code something else reads stands in for the compiler bug that
 * would keep it (an erased region's owner survives when other generated code
 * reads it).
 */
import { describe, expect, it } from 'vitest'
import { compileModule } from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerConfigFrom,
} from '@tanstack/router-plugin/planners'
import { MemoryHost, clientEnv } from './memory-host'
import type { HostServices, Planner } from '@tanstack/router-utils/compiler'

const FILE = '/app/src/routes/index.tsx'

const routeModule = (option: string) =>
  `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ${option},
  component: () => 'MARK_COMPONENT',
})
`

const OPTIONS: Array<{ key: string; option: string }> = [
  {
    key: 'server',
    option: `server: { handlers: { GET: () => new Response('MARK_SECRET') } }`,
  },
  { key: 'headers', option: `headers: () => ({ 'x-secret': 'MARK_SECRET' })` },
  { key: 'ssr', option: `ssr: () => 'MARK_SECRET' === 'data-only'` },
]

const config = {
  configKey: 'cfg',
  perPlanner: {
    [ROUTER_PLANNER]: routerPlannerConfigFrom(undefined, {
      framework: 'react',
      envType: 'client',
      mode: 'build',
      hmrStyle: 'vite',
      start: true,
    }),
  },
}

/** Hoists the value of the option `key` into a module-level `const` other generated code reads. */
const hoisting = (key: string): Planner => ({
  name: 'toy-hoist-erased-option',
  tier: 1,
  gate: () => true,
  plan(ctx) {
    const code = ctx.analysis.source.code
    const at = code.indexOf(`${key}: `) + `${key}: `.length
    const end = code.indexOf(',\n  component')
    const region = ctx.region({ start: at, end }, 'option-value')
    const hoisted = ctx.names.alloc('hoisted')
    const owner = ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: [`const ${hoisted.name} = `] },
        { k: 'region', id: region },
        { k: 'text', parts: ['\n'] },
      ],
      declares: [hoisted.sym],
      effectful: false,
      anchor: { k: 'end' },
      home: 'env',
      by: 'toy-hoist-erased-option',
    })
    ctx.rewrites.claim({
      region,
      owner,
      placeholder: [{ k: 'text', parts: [{ sym: hoisted.sym }] }],
      by: 'toy-hoist-erased-option',
    })
    ctx.rewrites.addGenerated({
      body: [
        { k: 'text', parts: ['console.log(', { sym: hoisted.sym }, ')\n'] },
      ],
      declares: [],
      effectful: true,
      anchor: { k: 'end' },
      home: 'env',
      by: 'toy-hoist-erased-option',
    })
  },
})

function compile(code: string, planners: Array<Planner>) {
  const memory = new MemoryHost({ [FILE]: code })
  const host: HostServices = {
    resolve: (specifier, importer) => memory.resolve(specifier, importer),
    rawFacts: memory.rawFacts,
    routes: {
      lookup: (path) =>
        path === FILE
          ? { routeId: '/', kind: 'file', routerConstructor: true }
          : null,
      digestFor: (path) => (path === FILE ? 'route' : null),
    },
  }
  return compileModule(
    {
      id: FILE,
      code,
      env: clientEnv,
      planners,
      config,
      wantMap: false,
    },
    host,
    memory.caches,
  )
}

describe.each(OPTIONS)(
  "a route's `$key` option in a client compile under Start",
  ({ key, option }) => {
    it('is erased from the route module (control)', async () => {
      const out = await compile(routeModule(option), [routerPlanner()])
      expect(out!.code).not.toContain('MARK_SECRET')
      expect(out!.diagnostics).toEqual([])
    })

    it('fails the compile when a client output keeps it', async () => {
      await expect(
        compile(routeModule(option), [routerPlanner(), hoisting(key)]),
      ).rejects.toThrow(
        `server code in a client output: ${FILE} holds the route's \`${key}\` option`,
      )
    })
  },
)
