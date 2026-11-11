/**
 * The executing placement property on the core's toy planner (REVIEW-
 * design2-final; `placement-exec/property.ts`): random modules compiled in
 * 12 configurations (split keys, groups, extracted exports, identifier
 * edits; client and server) and run as ES modules, source against outputs.
 * The router planner's run is router-plugin's `placement-exec.test.ts`.
 * `PX_SEEDS=<from>-<to>` widens the range.
 */
import { describe, expect, it } from 'vitest'
import { EMPTY_RECOGNIZER } from '../src/compiler'
import { MemoryHost, envInfo, toySplitPlanner } from './helpers'
import {
  LIB_TS,
  collect,
  disagreements,
  seedRange,
} from './placement-exec/property'
import type { Config } from './placement-exec/property'
import type { RecognizerTable } from '../src/compiler'
import type { ToySplitOptions } from './helpers'

const recognizer: RecognizerTable = {
  ...EMPTY_RECOGNIZER,
  factories: {
    'toy-start': {
      createServerFn: 'serverFn',
      createMiddleware: 'middleware',
    },
  },
  builderKinds: new Set(['serverFn', 'middleware']),
  terminal: { serverFn: 'serverFn' },
  builderLinks: {
    serverFn: { middleware: 'both', validator: 'server', handler: 'server' },
    middleware: { middleware: 'both', server: 'server', client: 'both' },
  },
  builderLinksWrite: new Set(['middleware']),
}

const file = '/app/route.tsx'
const configs: Array<Config> = (
  [
    ['c', { keys: ['component'] }],
    ['c+x', { keys: ['component'], extractExports: true }],
    ['c,l+x', { keys: ['component', 'loader'], extractExports: true }],
    [
      'c,l,b,e',
      { keys: ['component', 'loader', 'beforeLoad', 'errorComponent'] },
    ],
    [
      'c~e,l+x',
      {
        keys: ['component', 'errorComponent', 'loader'],
        groups: [['component', 'errorComponent']],
        extractExports: true,
      },
    ],
    [
      'c,l ident+x',
      {
        keys: ['component', 'loader'],
        identifierEdits: true,
        extractExports: true,
      },
    ],
  ] as Array<[string, ToySplitOptions]>
).flatMap(([label, opts]) =>
  (['client', 'server'] as const).map(
    (type): Config => ({
      label: `toy ${label} ${type}`,
      router: 'toy-router',
      file,
      compile: (code, mode, builders) => {
        const host = new MemoryHost({
          files: { [file]: code, '/app/lib.ts': LIB_TS },
          ...(builders && { recognizer }),
        })
        const env = envInfo({ mode, type, name: type })
        return collect(file, (id) =>
          host.compile(id, [toySplitPlanner(opts)], { env }),
        )
      },
    }),
  ),
)

describe('the executing placement property (toy planner)', () => {
  const [from, to] = seedRange(process.env.PX_SEEDS, [1, 400])
  it(`what the outputs do is what the source does (seeds ${from}-${to})`, async () => {
    expect(await disagreements(configs, from, to)).toEqual([])
  }, 600_000)
})
