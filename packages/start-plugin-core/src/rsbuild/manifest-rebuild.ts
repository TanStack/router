import { reportingFailure } from '@tanstack/router-utils/compiler'
import { buildGenerated } from './generated-module'
import type { Rspack } from '@rsbuild/core'
import type { NormalizedClientBuild } from '../types'
import type { VirtualModuleState } from './virtual-modules'
import type { GeneratedTarget } from './generated-module'

export interface ManifestRebuildOptions {
  /** Name of the finishMake tap. */
  name: string
  virtualModuleState: Pick<
    VirtualModuleState,
    'manifestPath' | 'getManifestContent' | 'updateManifest'
  >
  /** The server compiler's generated module at a file (`StartRsbuildCompilerSession.generatedTarget`). */
  target: (file: string) => GeneratedTarget
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
 * so the server bundle serves the manifest of the last client build, in
 * every mode (a dev server, a watch build, a production build whose module
 * the persistent cache restored from an earlier build's manifest).
 *
 * The manifest module is a virtual module under `node_modules/.virtual/`,
 * and Rspack's watcher ignores `node_modules` by default: the write alone
 * never makes a later compilation build the module again. The module is
 * built again when it was built from another content than the manifest
 * written last (`generated-module.ts`; a child compilation's module too):
 * rebuilding an unchanged module can make Rspack rebuild the whole chunk
 * graph.
 */
export function tapManifestRebuild(
  compiler: Rspack.Compiler,
  options: ManifestRebuildOptions,
): void {
  const { virtualModuleState } = options
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

          const content = virtualModuleState.getManifestContent()
          if (content !== undefined) {
            await buildGenerated(
              compilation,
              options.target(virtualModuleState.manifestPath),
              content,
            )
          }
        },
      ),
  )
}
