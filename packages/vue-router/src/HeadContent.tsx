import * as Vue from 'vue'

import { Asset } from './Asset'
import { useTags } from './headContentUtils'

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
 */
export const HeadContent = Vue.defineComponent({
  name: 'HeadContent',
  setup() {
    const tags = useTags()

    return () => {
      return tags().map((tag) =>
        Vue.h(Asset, {
          ...tag,
          key: `tsr-meta-${JSON.stringify(tag)}`,
        }),
      )
    }
  },
})
