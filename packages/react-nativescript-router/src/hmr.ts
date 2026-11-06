import { getLivePageRecords } from './page'
import {
  collectAffected,
  collectDescendants,
  moduleKey,
  routeFile,
  routeIdFromFile,
} from './hmr-graph'
import type { AnyRouter } from '@tanstack/react-router/native'

// @nativescript/vite's React HMR re-imports changed modules but leaves applying
// them to the app through `globalThis.__NS_HMR_ON_UPDATE__`. Routes hold their
// component on `Route.options.component`, so an edit is applied by evicting every
// module between an affected route and the changed file (an unchanged
// intermediate keeps its link to the old module instance otherwise),
// re-importing the route, swapping its component onto the live route, and
// remounting the native pages.

interface HmrModuleInfo {
  id: string
  deps?: Array<string>
}

interface HmrUpdatePayload {
  type?: string
  changedIds?: Array<string>
  raw?: {
    modules?: Array<HmrModuleInfo>
    changed?: Array<HmrModuleInfo>
  }
}

type HmrGlobal = typeof globalThis & {
  __NS_HMR_ON_UPDATE__?: (payload: HmrUpdatePayload) => void
  __NS_HTTP_ORIGIN__?: string
  require?: (id: string) => {
    invalidateModules?: (urls: Array<string>) => void
  }
}

function evictModules(g: HmrGlobal, origin: string, keys: Iterable<string>) {
  let invalidate: ((urls: Array<string>) => void) | undefined
  try {
    invalidate = g.require?.('ns:module').invalidateModules
  } catch {
    return
  }
  if (!invalidate) return
  const urls: Array<string> = []
  for (const key of keys) {
    urls.push(`${origin}/ns/m${key}`)
    for (const ext of ['.tsx', '.ts', '.jsx', '.js']) {
      urls.push(`${origin}/ns/m${key}${ext}`)
    }
  }
  invalidate(urls)
}

export function subscribeNativeScriptHmr(router: AnyRouter): () => void {
  const g = globalThis as HmrGlobal
  const importers = new Map<string, Set<string>>()
  const deps = new Map<string, Set<string>>()
  let queue = Promise.resolve()
  let nonce = 0

  const recordModules = (modules: Array<HmrModuleInfo> = []) => {
    for (const module of modules) {
      const key = moduleKey(module.id)
      for (const set of importers.values()) set.delete(key)
      const ownDeps = new Set<string>()
      for (const dep of module.deps ?? []) {
        const depKey = moduleKey(dep)
        if (depKey.includes('/node_modules/')) continue
        ownDeps.add(depKey)
        let set = importers.get(depKey)
        if (!set) importers.set(depKey, (set = new Set()))
        set.add(key)
      }
      deps.set(key, ownDeps)
    }
  }

  const reimport = async (origin: string, key: string) => {
    const stamp = `${Date.now()}_${++nonce}`
    const candidates = [
      `${origin}/ns/m${key}`,
      `${origin}/ns/m/__ns_hmr__/r-${stamp}${key}?t=${stamp}`,
    ]
    for (const url of candidates) {
      try {
        const mod = await import(/* @vite-ignore */ url)
        if (mod?.Route)
          return mod as { Route: { options?: { component?: unknown } } }
      } catch {
        // try the next URL shape
      }
    }
    return null
  }

  const apply = async (payload: HmrUpdatePayload) => {
    if (payload.type === 'full-graph') {
      importers.clear()
      deps.clear()
      recordModules(payload.raw?.modules)
      return
    }
    if (payload.type !== 'delta') return
    recordModules(payload.raw?.changed)

    const changed = (payload.changedIds ?? [])
      .map(moduleKey)
      .filter((key) => !key.includes('/node_modules/'))
    if (changed.length === 0) return

    const origin = g.__NS_HTTP_ORIGIN__
    if (!origin) return

    const affected = collectAffected(importers, changed)
    const routeKeys = [...affected].filter(
      (key) => routeFile.test(`${key}.tsx`) && routeIdFromFile(key) !== null,
    )
    if (routeKeys.length === 0) return
    evictModules(g, origin, collectDescendants(deps, routeKeys, affected))
    let replaced = 0
    for (const key of routeKeys) {
      const routeId = routeIdFromFile(key)!
      const route = (router.routesById as Record<string, any>)[routeId]
      const mod = await reimport(origin, key)
      const component = mod?.Route.options?.component
      if (!route || !component) continue
      route.options.component = component
      replaced++
    }
    if (replaced === 0) return
    for (const record of getLivePageRecords()) record.remount()
  }

  const previous = g.__NS_HMR_ON_UPDATE__
  const hook = (payload: HmrUpdatePayload) => {
    try {
      previous?.(payload)
    } catch {
      // a failing earlier subscriber must not block route updates
    }
    queue = queue
      .then(() => apply(payload))
      .catch((error) => {
        console.error('[tanstack-router][hmr] update failed', error)
      })
  }
  g.__NS_HMR_ON_UPDATE__ = hook
  return () => {
    if (g.__NS_HMR_ON_UPDATE__ === hook) g.__NS_HMR_ON_UPDATE__ = previous
  }
}
