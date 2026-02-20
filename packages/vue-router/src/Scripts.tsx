import * as Vue from 'vue'
import { useStore } from './useStore'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = Vue.defineComponent({
  name: 'Scripts',
  setup() {
    const router = useRouter()
    const nonce = router.options.ssr?.nonce
    const matches = useStore(router.activeMatchesSnapshotStore, (value) => value)

    const assetScripts = Vue.computed<Array<RouterManagedTag>>(() => {
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest

      if (!manifest) {
        return []
      }

      matches.value
        .map((match) => router.looseRoutesById[match.routeId]!)
        .forEach((route) =>
          manifest.routes[route.id]?.assets
            ?.filter((d) => d.tag === 'script')
            .forEach((asset) => {
              assetScripts.push({
                tag: 'script',
                attrs: { ...asset.attrs, nonce },
                children: asset.children,
              } as RouterManagedTag)
            }),
        )

      return assetScripts
    })

    const scripts = Vue.computed(() => ({
      scripts: (
        matches.value
          .map((match) => match.scripts!)
          .flat(1)
          .filter(Boolean) as Array<RouterManagedTag>
      ).map(({ children, ...script }) => ({
        tag: 'script' as const,
        attrs: {
          ...script,
          nonce,
        },
        children,
      })),
    }))

    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      const allScripts: Array<RouterManagedTag> = []

      if (router.serverSsr) {
        const serverBufferedScript = router.serverSsr.takeBufferedScripts()
        if (serverBufferedScript) {
          allScripts.push(serverBufferedScript)
        }
      } else if (router.ssr && !mounted.value) {
        allScripts.push({
          tag: 'script',
          attrs: { nonce, 'data-allow-mismatch': true },
          children: '',
        } as RouterManagedTag)

        allScripts.push({
          tag: 'script',
          attrs: {
            nonce,
            id: '$tsr-stream-barrier',
            'data-allow-mismatch': true,
          },
          children: '',
        } as RouterManagedTag)

        for (const asset of assetScripts.value) {
          allScripts.push({
            tag: 'script',
            attrs: {
              ...asset.attrs,
              'data-allow-mismatch': true,
            },
            children: '',
          } as RouterManagedTag)
        }
      }

      for (const script of scripts.value.scripts) {
        allScripts.push(script as RouterManagedTag)
      }

      if (mounted.value || router.serverSsr) {
        for (const asset of assetScripts.value) {
          allScripts.push(asset)
        }
      }

      return (
        <>
          {allScripts.map((asset, i) => (
            <Asset {...asset} key={`tsr-scripts-${asset.tag}-${i}`} />
          ))}
        </>
      )
    }
  },
})
