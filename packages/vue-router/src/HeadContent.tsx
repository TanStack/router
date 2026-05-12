import * as Vue from 'vue'

import { Asset } from './Asset'
import { useTags } from './headContentUtils'
import type { AssetCrossOriginConfig } from '@tanstack/router-core'

export interface HeadContentProps {
  assetCrossOrigin?: AssetCrossOriginConfig
}

/**
 * @description The `HeadContent` component is used to render meta tags, links, and scripts for the current route.
 * It should be rendered in the `<head>` of your document.
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
