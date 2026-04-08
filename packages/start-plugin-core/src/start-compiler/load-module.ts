import { SERVER_FN_LOOKUP } from '../constants'
import { cleanId } from './utils'
import type { StartCompiler } from './compiler'

interface ViteCompilerModuleLoaderOptions {
  compiler: StartCompiler
  mode: string
  fetchModule?: (id: string) => Promise<unknown>
  loadModule: (opts: { id: string }) => Promise<{ code?: string | null }>
  id: string
}

export async function loadModuleForViteCompiler(
  opts: ViteCompilerModuleLoaderOptions,
): Promise<void> {
  if (opts.mode === 'build') {
    const loaded = await opts.loadModule({ id: opts.id })
    const code = loaded.code ?? ''

    opts.compiler.ingestModule({ code, id: opts.id })

    return
  }

  if (opts.mode !== 'dev' || !opts.fetchModule) {
    throw new Error(
      `could not load module ${opts.id}: unknown environment mode ${opts.mode}`,
    )
  }

  await opts.fetchModule(`${opts.id}?${SERVER_FN_LOOKUP}`)
}

export async function loadModuleForRsbuildCompiler(opts: {
  compiler: StartCompiler
  id: string
}): Promise<void> {
  opts.compiler.invalidateModule(cleanId(opts.id))
}
