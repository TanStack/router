import type { TanStackStartOutputConfig } from './schema'

export interface PrerenderEnvState {
  prerendering: string | undefined
  clientOutputDir: string | undefined
}

export function capturePrerenderEnv(): PrerenderEnvState {
  return {
    prerendering: process.env.TSS_PRERENDERING,
    clientOutputDir: process.env.TSS_CLIENT_OUTPUT_DIR,
  }
}

export function restorePrerenderEnv(state: PrerenderEnvState) {
  if (state.prerendering === undefined) {
    delete process.env.TSS_PRERENDERING
  } else {
    process.env.TSS_PRERENDERING = state.prerendering
  }

  if (state.clientOutputDir === undefined) {
    delete process.env.TSS_CLIENT_OUTPUT_DIR
  } else {
    process.env.TSS_CLIENT_OUTPUT_DIR = state.clientOutputDir
  }
}

export function shouldSeparateRouteOptions(
  startConfig: TanStackStartOutputConfig,
) {
  return (
    !startConfig.spa?.enabled &&
    isPrerenderEnabled(startConfig) &&
    startConfig.prerender?.separateRouteOptionsBundle !== false
  )
}

export function shouldStripRouteOptionsFromServer(
  startConfig: TanStackStartOutputConfig,
) {
  return (
    Boolean(startConfig.spa?.enabled) ||
    !isPrerenderEnabled(startConfig) ||
    startConfig.prerender?.separateRouteOptionsBundle !== false
  )
}

function isPrerenderEnabled(startConfig: TanStackStartOutputConfig) {
  return (
    startConfig.prerender?.enabled ??
    startConfig.pages.some((page) => page.prerender?.enabled)
  )
}
