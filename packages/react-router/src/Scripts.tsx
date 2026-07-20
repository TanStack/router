import { useStore } from '@tanstack/react-store'
import { _getRenderedMatches, deepEqual } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

type ScriptRenderAsset = RouterManagedTag & {
  preventScriptHoist?: boolean
}

/**
 * Render body script tags collected from route matches and SSR manifests.
 * Should be placed near the end of the document body.
 */
export const Scripts = () => {
  const router = useRouter()
  const nonce = router.options.ssr?.nonce

  const getScripts = (matches: Array<any>) => {
    matches = _getRenderedMatches(matches)
    const scripts = matches
      .flatMap((match) => match.scripts ?? [])
      .filter(Boolean)
      .map(
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
      ) as Array<ScriptRenderAsset>
    const manifest = router.ssr?.manifest

    if (!manifest) {
      return scripts
    }

    for (const match of matches) {
      const manifestScripts = manifest.routes[match.routeId]?.scripts

      if (!manifestScripts) {
        continue
      }

      for (const asset of manifestScripts) {
        scripts.push({
          tag: 'script',
          attrs: { ...asset.attrs, nonce },
          children: asset.children,
          ...(typeof asset.attrs?.src === 'string'
            ? { preventScriptHoist: true }
            : {}),
        })
      }
    }

    return scripts
  }

  if (isServer ?? router.isServer) {
    const activeMatches = router.stores.matches.get()
    const scripts = getScripts(activeMatches)
    return renderScripts(router, scripts)
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks -- condition is static
  const scripts = useStore(router.stores.matches, getScripts, deepEqual)

  return renderScripts(router, scripts)
}

function renderScripts(
  router: ReturnType<typeof useRouter>,
  scripts: Array<ScriptRenderAsset>,
) {
  if ((isServer ?? router.isServer) && router.serverSsr) {
    const serverBufferedScript = router.serverSsr.takeBufferedScripts()
    if (serverBufferedScript) {
      scripts.unshift(serverBufferedScript)
    }
  }

  return (
    <>
      {scripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
