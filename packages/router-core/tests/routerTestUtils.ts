import { runInNewContext } from 'node:vm'
import { expect } from 'vitest'
import { batch, createAtom } from '@tanstack/store'
import { isServer } from '@tanstack/router-core/isServer'
import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
} from '../src'
import { createRequestHandler } from '../src/ssr/createRequestHandler'
import { HYDRATION_SCRIPT_BOUNDARY_SOURCE } from '../src/ssr/hydrationScripts'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import type { ServerManifest } from '../src/manifest'
import type { TsrSsrGlobal } from '../src/ssr/types'
import type { RouterHistory } from '@tanstack/history'
import type {
  AnyRouter,
  AnyRoute,
  GetStoreConfig,
  RouterConstructorOptions,
  TrailingSlashOption,
} from '../src'

const getStoreConfig: GetStoreConfig = (opts) => {
  if (isServer ?? opts.isServer) {
    return {
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn) => fn(),
    }
  }

  return {
    createMutableStore: createAtom,
    createReadonlyStore: createAtom,
    batch,
  }
}

export function createTestRouter<
  TRouteTree extends AnyRoute,
  TTrailingSlashOption extends TrailingSlashOption = 'never',
  TDefaultStructuralSharingOption extends boolean = false,
  TRouterHistory extends RouterHistory = RouterHistory,
  TDehydrated extends Record<string, any> = Record<string, any>,
>(
  options: RouterConstructorOptions<
    TRouteTree,
    TTrailingSlashOption,
    TDefaultStructuralSharingOption,
    TRouterHistory,
    TDehydrated
  >,
) {
  return new RouterCore(options, getStoreConfig)
}

/** Materialize the request-local server result as the HTTP response users see. */
export function loadServerResponse(
  router: AnyRouter,
  path: string,
  signal?: AbortSignal,
) {
  return createRequestHandler({
    createRouter: () => router,
    request: new Request(`http://localhost${path}`, { signal }),
  })(({ router: loadedRouter, responseHeaders }) => {
    const result = loadedRouter._serverResult
    return new Response(null, {
      status:
        result?.type === 'redirect'
          ? result.redirect.status
          : (result?.status ?? 500),
      headers: responseHeaders,
    })
  })
}

export async function dehydrateToBootstrap(
  router: AnyRouter,
  manifest: ServerManifest,
): Promise<TsrSsrGlobal> {
  attachRouterServerSsrUtils({ router, manifest })
  try {
    await router.load()
    await router.serverSsr!.dehydrate()

    const scripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(scripts?.before.length).toBeGreaterThan(0)
    expect(scripts?.boundary.children).toBe(HYDRATION_SCRIPT_BOUNDARY_SOURCE)
    expect(scripts?.boundary.attrs).not.toHaveProperty('id')

    const context: Record<string, any> = {
      document: {
        currentScript: {
          remove() {},
        },
      },
    }
    context.self = context
    for (const script of scripts!.before) {
      expect(script.attrs?.['data-tsr-stream-part']).toBe('')
      expect(script.children).toBeTruthy()
      runInNewContext(script.children!, context)
    }

    expect(context.$_TSR).toBeDefined()
    return context.$_TSR
  } finally {
    router.serverSsr?.cleanup()
  }
}
