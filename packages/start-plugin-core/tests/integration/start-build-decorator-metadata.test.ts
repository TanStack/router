/**
 * A type never keeps a value (user decision, 2026-11-25), but decorator
 * metadata (`emitDecoratorMetadata`: DI containers, ORMs, validation DTOs)
 * reads the type of a decorated member by value when the class is defined:
 * a class only that annotation names stays, and the client records it
 * instead of throwing a ReferenceError. Vite's Oxc reads the setting from the
 * tsconfig; Rsbuild's SWC from its decorator options.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

const files = {
  'src/module.ts': `import { createServerFn } from '@tanstack/react-start'
;(Reflect as any).metadata = (key: string, value: any) => (target: any) => {
  if (key === 'design:type') target.constructor.recorded = value.name
}
const seen = (..._args: Array<unknown>): any => {}
class Model {}
export class Entity {
  @seen model!: Model
}
export const fn = createServerFn().handler(async () => 1)
export const recorded = () => (Entity as any).recorded
`,
  'src/entry.ts': `export { recorded } from './module'\n`,
  'tsconfig.json': JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      useDefineForClassFields: false,
    },
  }),
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'a class only a decorated member names in its type stays for its metadata',
    async () => {
      const build = await buildStart({
        bundler,
        files,
        entry: 'src/entry.ts',
        // (unminified: the class keeps its name)
        minify: false,
        ...(bundler === 'rsbuild' && {
          rsbuildConfig: {
            source: { decorators: { version: 'legacy' } },
            tools: {
              swc: { jsc: { transform: { decoratorMetadata: true } } },
            },
          },
        }),
      })
      expect((await build.client.run('return entry.recorded()')).result).toBe(
        'Model',
      )
    },
    timeout,
  )
})
