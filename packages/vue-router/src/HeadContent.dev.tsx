import * as Vue from 'vue'
import { DEV_STYLES_ATTR, DEV_STYLES_STALE_EVENT } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'

import { Asset } from './Asset'
import { useRouter } from './useRouter'
import { useTags } from './headContentUtils'
import type {
  AssetCrossOriginConfig,
  RouterManagedTag,
} from '@tanstack/router-core'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
 *
 * This is the development version: it keeps the SSR dev styles link until an
 * HMR update makes it stale. Removing it at hydration would unstyle
 * server-rendered content whose modules are still loading (e.g. async
 * components inside Suspense).
 */
export const HeadContent = Vue.defineComponent({
  name: 'HeadContent',
  props: {
    assetCrossOrigin: {
      type: [String, Object] as Vue.PropType<AssetCrossOriginConfig>,
      default: undefined,
    },
  },
  setup(props) {
    const tags = useTags(props.assetCrossOrigin)
    const router = useRouter()

    const renderTags = (list: Array<RouterManagedTag>) =>
      list.map((tag) =>
        Vue.h(Asset, {
          ...tag,
          key: `tsr-meta-${JSON.stringify(tag)}`,
        }),
      )

    if (isServer ?? router.isServer) {
      return () => renderTags(tags())
    }

    const stale = Vue.ref(false)
    const markStale = () => {
      stale.value = true
      // Also drop links that are not owned by this component (hydration mismatch)
      document
        .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
        .forEach((el) => el.remove())
    }

    Vue.onMounted(() => {
      window.addEventListener(DEV_STYLES_STALE_EVENT, markStale)
    })
    Vue.onBeforeUnmount(() => {
      window.removeEventListener(DEV_STYLES_STALE_EVENT, markStale)
    })

    return () =>
      renderTags(
        stale.value
          ? tags().filter(
              (tag) =>
                tag.tag !== 'link' || tag.attrs?.[DEV_STYLES_ATTR] !== true,
            )
          : tags(),
      )
  },
})
