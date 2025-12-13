import { Asset } from './Asset'
import { useRouterState } from './useRouterState'
import { useRouter } from './useRouter'
import { getHydrateStatus } from './hydrate-status'
import type { RouterManagedTag } from '@tanstack/router-core'

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
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
              // If hydrate is false, skip client entry scripts
              if (!shouldHydrate) {
                // Check by attribute
                if (
                  asset.attrs?.['data-tsr-client-entry'] === 'true' ||
                  asset.attrs?.['data-tsr-client-entry'] === true
                ) {
                  return
                }

                // Also check by content as fallback
                const scriptContent = asset.children?.toString() || ''
                if (
                  scriptContent.includes('virtual:tanstack-start-client-entry')
                ) {
                  return
                }
              }

              assetScripts.push({
                tag: 'script',
                attrs: { ...asset.attrs, nonce },
                children: asset.children,
              } as any)
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
      }))

      // If hydrate is false, remove client entry imports but keep React Refresh for HMR
      if (!shouldHydrate) {
        return allScripts
          .map((script) => {
            const scriptContent = script.children?.toString() || ''

            // If this script contains the client entry import, remove that import
            // but keep the React Refresh setup for development HMR
            if (scriptContent.includes('virtual:tanstack-start-client-entry')) {
              // Remove the import line(s) that load the client entry
              const modifiedContent = scriptContent
                .split('\n')
                .filter(
                  (line) =>
                    !line.includes('virtual:tanstack-start-client-entry'),
                )
                .join('\n')
                .trim()

              // If there's still content (React Refresh setup), keep it
              if (modifiedContent) {
                return {
                  ...script,
                  children: modifiedContent,
                }
              }
              // If filtering removed everything, exclude this script
              return null
            }

            return script
          })
          .filter(Boolean) as Array<RouterManagedTag>
      }

      return allScripts
    },
    structuralSharing: true as any,
  })

  // Warn about conflicting hydrate options
  if (hydrateStatus.hasConflict) {
    console.warn(
      '⚠️ [TanStack Router] Conflicting hydrate options detected in route matches.\n' +
        'Some routes have hydrate: false while others have hydrate: true.\n' +
        'The page will be hydrated, but this may not be the intended behavior.\n' +
        'Please ensure all routes in the match have consistent hydrate settings.',
    )
  }

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
