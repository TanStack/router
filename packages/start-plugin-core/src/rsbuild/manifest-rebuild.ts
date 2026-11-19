import {
  rebuildModules,
  reportingFailure,
} from '@tanstack/router-utils/compiler'
import type { Rspack } from '@rsbuild/core'
import type { NormalizedClientBuild } from '../types'
import type { VirtualModuleState } from './virtual-modules'

export interface ManifestRebuildOptions {
  /** Name of the finishMake tap. */
  name: string
  virtualModuleState: Pick<
    VirtualModuleState,
    'manifestPath' | 'getManifestWriteCount' | 'updateManifest'
  >
  /**
   * Rebuild only when the manifest module was written since this compiler
   * last rebuilt it (dev), else in every compilation (build).
   */
  onlyWhenWritten: boolean
  /**
   * The client build to write the manifest module from first (RSC: the
   * client compiles concurrently with the server, so it may have completed
   * after this compilation began). Without one, the module is as the last
   * completed client compilation wrote it.
   */
  clientBuild?: () => NormalizedClientBuild | undefined
}

/**
 * Rebuilds the server environment's manifest module at finishMake stage 10,
 * so the server bundle serves the manifest of the last client build.
 *
 * The manifest module is a virtual module under `node_modules/.virtual/`,
 * and Rspack's watcher ignores `node_modules` by default: the write alone
 * never makes a later compilation build the module again. In dev the module
 * is rebuilt only when it was written since this compiler last rebuilt it,
 * and once in the compiler's first compilation (a client compilation may
 * have written it after this one built it): rebuilding an unchanged module
 * can make Rspack rebuild the whole chunk graph.
 */
export function tapManifestRebuild(
  compiler: Rspack.Compiler,
  options: ManifestRebuildOptions,
): void {
  const { virtualModuleState } = options
  // The manifest write count this compiler last rebuilt from (dev)
  let rebuiltAtWriteCount: number | undefined

  compiler.hooks.finishMake.tapPromise(
    {
      name: options.name,
      // After RSC's ServerPlugin completes the client-entry handoff in its
      // own finishMake tap (stage 0)
      stage: 10,
    },
    (compilation) =>
      reportingFailure(
        compiler,
        compilation.errors,
        {
          tag: '[tanstack-start]',
          what: 'Building the Start manifest again',
        },
        async () => {
          if (options.clientBuild) {
            const clientBuild = options.clientBuild()
            if (!clientBuild) {
              return
            }
            virtualModuleState.updateManifest(clientBuild)
          }

          const rebuild = () =>
            rebuildModules(
              compilation,
              new Set([virtualModuleState.manifestPath]),
              (r) => r,
            )

          // Child compilers copy finishMake taps from their parent. Child
          // compilations always rebuild and do not change this compiler's state.
          if (!options.onlyWhenWritten || compilation.compiler !== compiler) {
            await rebuild()
            return
          }

          const writeCount = virtualModuleState.getManifestWriteCount()
          if (writeCount === rebuiltAtWriteCount) {
            return
          }
          rebuiltAtWriteCount = writeCount
          await rebuild()
        },
      ),
  )
}
