import * as Vue from 'vue'
import { _getRenderedMatches } from '@tanstack/router-core'
import { useStore } from '@tanstack/vue-store'
import { isServer } from '@tanstack/router-core/isServer'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

type ScriptsRenderState = {
  scripts: Array<RouterManagedTag>
  assetScripts: Array<RouterManagedTag>
  mounted: boolean
  nonce?: string
}

export const Scripts = Vue.defineComponent({
  name: 'Scripts',
  setup() {
    const router = useRouter()
    const nonce = router.options.ssr?.nonce
    const matches = useStore(router.stores.matches, _getRenderedMatches)

    const scripts = Vue.computed(() => {
      const userScripts: Array<RouterManagedTag> = []
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest
      for (const match of matches.value) {
        for (const script of match.scripts ?? []) {
          if (!script) {
            continue
          }
          const { children, ...attrs } = script
          userScripts.push({
            tag: 'script',
            attrs: { ...attrs, nonce },
            children,
          })
        }
        for (const asset of manifest?.routes[match.routeId]?.scripts ?? []) {
          assetScripts.push({
            tag: 'script',
            attrs: { ...asset.attrs, nonce },
            children: asset.children,
          })
        }
      }
      return [userScripts, assetScripts] as const
    })

    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      const [userScripts, assetScripts] = scripts.value
      return renderScripts(router, {
        scripts: userScripts,
        assetScripts,
        mounted: mounted.value,
        nonce,
      })
    }
  },
})

function renderScripts(
  router: ReturnType<typeof useRouter>,
  { scripts, assetScripts, mounted, nonce }: ScriptsRenderState,
) {
  const allScripts: Array<RouterManagedTag> = []

  if ((isServer ?? router.isServer) && router.serverSsr) {
    const serverBufferedScript = router.serverSsr.takeBufferedScripts()
    if (serverBufferedScript) {
      allScripts.push(serverBufferedScript)
    }
  } else if (router.ssr && !mounted) {
    allScripts.push({
      tag: 'script',
      attrs: { nonce, 'data-allow-mismatch': true },
      children: '',
    } satisfies RouterManagedTag)

    allScripts.push({
      tag: 'script',
      attrs: {
        nonce,
        id: '$tsr-stream-barrier',
        'data-allow-mismatch': true,
      },
      children: '',
    } satisfies RouterManagedTag)

    for (const asset of assetScripts) {
      allScripts.push({
        tag: 'script',
        attrs: {
          ...asset.attrs,
          'data-allow-mismatch': true,
        },
        children: '',
      } satisfies RouterManagedTag)
    }
  }

  allScripts.push(...scripts)

  if (mounted || ((isServer ?? router.isServer) && router.serverSsr)) {
    allScripts.push(...assetScripts)
  }

  return (
    <>
      {allScripts.map((asset, i) => (
        <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
      ))}
    </>
  )
}
