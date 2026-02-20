import * as Vue from 'vue'

import { Asset } from './Asset'
import { useHydrated } from './ClientOnly'
import { useTags } from './headContentUtils'

const DEV_STYLES_ATTR = 'data-tanstack-router-dev-styles'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
 *
 * This is the development version that filters out dev styles after hydration.
 */
export const HeadContent = Vue.defineComponent({
  name: 'HeadContent',
  setup() {
    const tags = useTags()
    const hydrated = useHydrated()

    // Fallback cleanup for hydration mismatch cases
    Vue.onMounted(() => {
      document
        .querySelectorAll(`link[${DEV_STYLES_ATTR}]`)
        .forEach((el) => el.remove())
    })

    return () => {
      // Filter out dev styles after hydration
      const filteredTags = hydrated.value
        ? tags().filter((tag) => !tag.attrs?.[DEV_STYLES_ATTR])
        : tags()

      return filteredTags.map((tag) =>
        Vue.h(Asset, {
          ...tag,
          key: `tsr-meta-${JSON.stringify(tag)}`,
        }),
      )
    }
  },
})
