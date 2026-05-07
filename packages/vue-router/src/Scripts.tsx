import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'
import {
  getHydrateStatus,
  stripClientEntryImport,
} from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

export const Scripts = Vue.defineComponent({
  name: 'Scripts',
  setup() {
    const router = useRouter()
    const nonce = router.options.ssr?.nonce
    const matches = useStore(router.stores.matches, (value) => value)

    const hydrateStatus = Vue.computed(() =>
      getHydrateStatus(matches.value, router),
    )

    const assetScripts = Vue.computed<Array<RouterManagedTag>>(() => {
      const assetScripts: Array<RouterManagedTag> = []
      const manifest = router.ssr?.manifest

      if (!manifest) {
        return []
      }

      const { shouldHydrate } = hydrateStatus.value

      matches.value
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
    })

    const scripts = Vue.computed(() => {
      const allScripts = (
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
      })) as Array<RouterManagedTag>

      const { shouldHydrate } = hydrateStatus.value
      if (!shouldHydrate) {
        return {
          scripts: allScripts
            .map(stripClientEntryImport)
            .filter(Boolean) as Array<RouterManagedTag>,
        }
      }

      return { scripts: allScripts }
    })

    Vue.watchEffect(() => {
      if (
        process.env.NODE_ENV !== 'production' &&
        hydrateStatus.value.hasConflict
      ) {
        console.warn(
          '[TanStack Router] Conflicting `hydrate` options detected in route matches: ' +
            'some routes set `hydrate: false` while others set `hydrate: true`. ' +
            'The page will not hydrate. Align route `hydrate` settings to silence this warning.',
        )
      }
    })

    const mounted = Vue.ref(false)
    Vue.onMounted(() => {
      mounted.value = true
    })

    return () => {
      const allScripts: Array<RouterManagedTag> = []
      const { shouldHydrate } = hydrateStatus.value

      if (router.serverSsr) {
        if (shouldHydrate) {
          const serverBufferedScript = router.serverSsr.takeBufferedScripts()
          if (serverBufferedScript) {
            allScripts.push(serverBufferedScript)
          }
        }
      } else if (router.ssr && !mounted.value && shouldHydrate) {
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
        allScripts.push(script)
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
