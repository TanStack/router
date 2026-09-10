import { bench, describe, expect } from 'vitest'
import * as z from 'zod'
import { readServerFnBuildInfo } from '../../src/rsbuild/start-compiler-host'
import { SERVER_FN_BUILD_INFO_FIELD } from '../../src/rsbuild/start-compiler-metadata'
import { mergeServerFnsById } from '../../src/start-compiler/host'
import type { ServerFn } from '../../src/start-compiler/types'

// The original reader parsed every module, including absent metadata.
const schema = z.object({
  version: z.literal(1),
  serverFnsById: z.record(
    z.string(),
    z.object({
      functionName: z.string(),
      functionId: z.string(),
      extractedFilename: z.string(),
      filename: z.string(),
      isClientReferenced: z.boolean().optional(),
    }),
  ),
})

const readWithoutGuard: typeof readServerFnBuildInfo = (module) => {
  const result = schema.safeParse(module.buildInfo[SERVER_FN_BUILD_INFO_FIELD])
  return result.success ? result.data.serverFnsById : null
}

describe.each([0, 1, 10, 100])(
  'restore 1,000 modules with metadata on %i percent of modules',
  (percent) => {
    const modules = Array.from({ length: 1000 }, (_, index) => ({
      buildInfo:
        index % 100 < percent
          ? {
              [SERVER_FN_BUILD_INFO_FIELD]: {
                version: 1,
                serverFnsById: {
                  [`id${index}`]: {
                    functionName: `fn${index}`,
                    functionId: `id${index}`,
                    extractedFilename: `/src/file${index}.ts?tsr-split`,
                    filename: `/src/file${index}.ts`,
                  },
                },
              },
            }
          : {},
    }))

    function restore(read: typeof readServerFnBuildInfo) {
      const restored: Record<string, ServerFn> = {}
      for (const module of modules) {
        const metadata = read(module)
        if (metadata) {
          mergeServerFnsById(restored, metadata)
        }
      }
      return restored
    }

    expect(restore(readServerFnBuildInfo)).toEqual(restore(readWithoutGuard))

    bench('always parse', () => {
      restore(readWithoutGuard)
    })
    bench('skip absent metadata', () => {
      restore(readServerFnBuildInfo)
    })
  },
)
