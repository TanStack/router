import { deepEqual } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './context'
import { splitSlot, subSlot } from './internal'
import { useStore } from './useStore'
import type {
  AnyRouteMatch,
  AnyRouter,
  RouterManagedTag,
} from '@tanstack/router-core'

function getScripts(router: AnyRouter, matches: Array<AnyRouteMatch>) {
  const nonce = router.options.ssr?.nonce
  const scripts: Array<RouterManagedTag> = matches
    .flatMap((match) => match.scripts ?? [])
    .filter((script) => script !== undefined)
    .map(({ children, ...attrs }) => ({
      tag: 'script',
      attrs: { ...attrs, nonce },
      children,
    }))

  const manifest = router.ssr?.manifest
  if (manifest) {
    for (const match of matches) {
      for (const asset of manifest.routes[match.routeId]?.scripts ?? []) {
        scripts.push({
          tag: 'script',
          attrs: { ...asset.attrs, nonce },
          children: asset.children,
        })
      }
    }
  }

  return scripts
}

export function useScripts(...args: Array<unknown>): Array<RouterManagedTag> {
  const [, slot] = splitSlot(args)
  const router = useRouter()

  if (isServer ?? router.isServer) {
    const scripts = getScripts(router, router.stores.matches.get())
    const buffered = router.serverSsr?.takeBufferedScripts()
    if (!buffered || buffered.tag !== 'script') {
      return scripts
    }
    return [
      {
        tag: 'script',
        attrs: buffered.attrs,
        children:
          typeof buffered.children === 'string'
            ? buffered.children.replace(
                /;document\.currentScript\.remove\(\)$/,
                '',
              )
            : buffered.children,
      },
      ...scripts,
    ]
  }

  return useStore(
    router.stores.matches,
    (matches: Array<AnyRouteMatch>) => getScripts(router, matches),
    deepEqual,
    subSlot(slot, 'body:scripts'),
  )
}
