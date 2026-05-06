import * as React from 'react'
import { useStore } from '@tanstack/react-store'
import { deepEqual, getHydrateStatus } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

// Identifies the client-entry script tag emitted by start-server-core's
// `buildClientEntryScriptTag`. When a route sets `hydrate: false`, we strip
// the tag's trailing `import(<clientEntry>)` (and skip the tag entirely if
// nothing else is in it) so the page renders SSR HTML without booting React
// on the client. Any injected prelude (e.g. React Refresh for HMR) is kept.
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

  const getAssetScripts = (matches: Array<any>) => {
    const assetScripts: Array<RouterManagedTag> = []
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return []
    }

    const { shouldHydrate } = getHydrateStatus(matches, router)

    matches
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
  }

  const getScripts = (matches: Array<any>): Array<RouterManagedTag> => {
    const allScripts = (
      matches
        .map((match) => match.scripts!)
        .flat(1)
        .filter(Boolean) as Array<RouterManagedTag>
    ).map(
      ({ children, ...script }) =>
        ({
          tag: 'script',
          attrs: {
            ...script,
            suppressHydrationWarning: true,
            nonce,
          },
          children,
        }) satisfies RouterManagedTag,
    )

    const { shouldHydrate } = getHydrateStatus(matches, router)
    if (!shouldHydrate) {
      return allScripts
        .map(stripClientEntryImport)
        .filter(Boolean) as Array<RouterManagedTag>
    }

    return allScripts
  }

  if (isServer ?? router.isServer) {
    const activeMatches = router.stores.matches.get()
    const assetScripts = getAssetScripts(activeMatches)
    const scripts = getScripts(activeMatches)
    const shouldHydrate = getHydrateStatus(activeMatches, router).shouldHydrate
    return renderScripts(router, scripts, assetScripts, shouldHydrate)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const assetScripts = useStore(
    router.stores.matches,
    getAssetScripts,
    deepEqual,
  )
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const scripts = useStore(router.stores.matches, getScripts, deepEqual)
  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const status = useStore(router.stores.matches, (matches) =>
    getHydrateStatus(matches, router),
  )

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  React.useEffect(() => {
    if (process.env.NODE_ENV !== 'production' && status.hasConflict) {
      console.warn(
        '[TanStack Router] Conflicting `hydrate` options detected in route matches: ' +
          'some routes set `hydrate: false` while others set `hydrate: true`. ' +
          'The page will not hydrate. Align route `hydrate` settings to silence this warning.',
      )
    }
  }, [status.hasConflict])

  return renderScripts(router, scripts, assetScripts, status.shouldHydrate)
}

function renderScripts(
  router: ReturnType<typeof useRouter>,
  scripts: Array<RouterManagedTag>,
  assetScripts: Array<RouterManagedTag>,
  shouldHydrate: boolean,
) {
  let serverBufferedScript: RouterManagedTag | undefined = undefined

  if (router.serverSsr && shouldHydrate) {
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
