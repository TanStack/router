import * as Vue from 'vue'
import { useStore } from '@tanstack/vue-store'
import { getHydrateStatus } from '@tanstack/router-core'
import { Asset } from './Asset'
import { useRouter } from './useRouter'
import type { RouterManagedTag, ScriptFilter } from '@tanstack/router-core'

function applyFilter(
  filter: ScriptFilter | undefined,
  script: RouterManagedTag,
  ctx: { shouldHydrate: boolean },
): RouterManagedTag | null {
  return filter ? filter(script, ctx) : script
}

const HYDRATE_CONFLICT_MESSAGE =
  '[TanStack Router] Conflicting `hydrate` options detected in route matches: ' +
  'some routes set `hydrate: false` while others set `hydrate: true`. ' +
  'The page will not hydrate. Align route `hydrate` settings to silence this warning.'

const warnedConflictRouters = new WeakSet<object>()

function warnHydrateConflictOnce(router: object) {
  if (process.env.NODE_ENV === 'production') return
  if (warnedConflictRouters.has(router)) return
  warnedConflictRouters.add(router)
  console.warn(HYDRATE_CONFLICT_MESSAGE)
}

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

      const ctx = { shouldHydrate: hydrateStatus.value.shouldHydrate }
      const filter = router.options.scriptFilter

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

              const filtered = applyFilter(filter, withNonce, ctx)
              if (filtered) assetScripts.push(filtered)
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

      const ctx = { shouldHydrate: hydrateStatus.value.shouldHydrate }
      const filter = router.options.scriptFilter
      if (!filter) return { scripts: allScripts }

      return {
        scripts: allScripts
          .map((s) => applyFilter(filter, s, ctx))
          .filter(Boolean) as Array<RouterManagedTag>,
      }
    })

    // Emit eagerly so SSR also surfaces conflicts; warnHydrateConflictOnce
    // dedupes per router instance. The watcher catches runtime changes on the
    // client (e.g. after a navigation reveals a new conflicting route).
    if (hydrateStatus.value.hasConflict) warnHydrateConflictOnce(router)
    Vue.watchEffect(() => {
      if (hydrateStatus.value.hasConflict) warnHydrateConflictOnce(router)
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
