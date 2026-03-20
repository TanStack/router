import * as React from 'react'
import { Asset } from './Asset'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { getHydrateStatus } from './hydrate-status'
import type { RouterManagedTag } from '@tanstack/router-core'

const CLIENT_ENTRY_MARKER_ATTR = 'data-tsr-client-entry'
const LEGACY_CLIENT_ENTRY_ID = 'virtual:tanstack-start-client-entry'
const TRAILING_IMPORT_RE = /(?:^|[;\n])\s*import\((['"]).*?\1\)\s*;?\s*$/s

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const hydrateStatus = useRouterState({
    select: (state) => getHydrateStatus(state.matches, router),
  })

  const assetScripts = useRouterState({
    select: (state) => {
      const { shouldHydrate } = getHydrateStatus(state.matches, router)
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest

      if (!manifest) {
        return []
      }

      state.matches
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) =>
          manifest.routes[route.id]?.assets
            ?.filter((d) => d.tag === 'script')
            .forEach((asset) => {
              const withNonce = {
                tag: 'script',
                attrs: { ...asset.attrs, nonce },
                children: asset.children,
              } as RouterManagedTag

              if (!shouldHydrate) {
                const normalized = stripClientEntryImport(withNonce)
                if (normalized) {
                  assetScripts.push(normalized)
                }
                return
              }

              assetScripts.push(withNonce)
            }),
        )

      return assetScripts
    },
    structuralSharing: true as any,
  })

  const scripts = useRouterState({
    select: (state) => {
      const { shouldHydrate } = getHydrateStatus(state.matches, router)

      const allScripts = (
        state.matches
          .map((match) => match.scripts!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...script }) => ({
        tag: 'script',
        attrs: {
          ...script,
          suppressHydrationWarning: true,
          nonce,
        },
        children,
      })) as Array<RouterManagedTag>

      // If hydrate is false, remove client entry imports but keep React Refresh for HMR
      if (!shouldHydrate) {
        return allScripts
          .map(stripClientEntryImport)
          .filter(Boolean) as Array<RouterManagedTag>
      }

      return allScripts
    },
    structuralSharing: true as any,
  })

  React.useEffect(() => {
    if (!hydrateStatus.hasConflict) {
      return
    }

    console.warn(
      '⚠️ [TanStack Router] Conflicting hydrate options detected in route matches.\n' +
        'Some routes have hydrate: false while others have hydrate: true.\n' +
        'The page will NOT be hydrated, but this may not be the intended behavior.\n' +
        'Please ensure all routes in the match have consistent hydrate settings.',
    )
  }, [hydrateStatus.hasConflict])

  let serverBufferedScript: RouterManagedTag | undefined = undefined

  // Only include server buffered script if we're hydrating
  if (router.serverSsr && hydrateStatus.shouldHydrate) {
    serverBufferedScript = router.serverSsr.takeBufferedScripts()
  }

  const allScripts = [...scripts, ...assetScripts] as Array<RouterManagedTag>

  if (serverBufferedScript) {
    allScripts.unshift(serverBufferedScript)
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}

function stripClientEntryImport(
  script: RouterManagedTag,
): RouterManagedTag | null {
  if (!isClientEntryScript(script)) {
    return script
  }

  if (typeof script.children !== 'string') {
    return null
  }

  const withoutImport = script.children.replace(TRAILING_IMPORT_RE, '').trim()

  if (withoutImport.length > 0) {
    return {
      ...script,
      children: withoutImport,
    }
  }

  if (script.children.includes(LEGACY_CLIENT_ENTRY_ID)) {
    const withoutLegacyImport = script.children
      .split('\n')
      .filter((line) => !line.includes(LEGACY_CLIENT_ENTRY_ID))
      .join('\n')
      .trim()

    if (withoutLegacyImport.length > 0) {
      return {
        ...script,
        children: withoutLegacyImport,
      }
    }
  }

  return null
}

function isClientEntryScript(script: RouterManagedTag): boolean {
  if (script.tag !== 'script') {
    return false
  }

  const marker = script.attrs?.[CLIENT_ENTRY_MARKER_ATTR]
  if (marker === true || marker === 'true') {
    return true
  }

  if (typeof script.children !== 'string') {
    return false
  }

  return script.children.includes(LEGACY_CLIENT_ENTRY_ID)
}
