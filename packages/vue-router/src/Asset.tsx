import * as Vue from 'vue'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './useRouter'
import type { RouterManagedTag } from '@tanstack/router-core'

interface ScriptAttrs {
  [key: string]: string | boolean | undefined
  src?: string
}

const Title = Vue.defineComponent({
  name: 'Title',
  props: {
    children: {
      type: String,
      default: '',
    },
  },
  setup(props) {
    const router = useRouter()

    if (!(isServer ?? router.isServer)) {
      Vue.onMounted(() => {
        if (props.children) {
          document.title = props.children
        }
      })

      Vue.watch(
        () => props.children,
        (newTitle) => {
          if (newTitle) {
            document.title = newTitle
          }
        },
      )
    }

    return () => Vue.h('title', {}, props.children)
  },
})

const Script = Vue.defineComponent({
  name: 'Script',
  props: {
    attrs: {
      type: Object as Vue.PropType<ScriptAttrs>,
      default: () => ({}),
    },
    children: {
      type: String,
      default: undefined,
    },
  },
  setup(props) {
    const router = useRouter()

    if (!(isServer ?? router.isServer)) {
      Vue.onMounted(() => {
        const attrs = props.attrs
        const children = props.children

        if (attrs?.src) {
          const normSrc = (() => {
            try {
              const base = document.baseURI || window.location.href
              return new URL(attrs.src, base).href
            } catch {
              return attrs.src
            }
          })()
          const existingScript = Array.from(
            document.querySelectorAll('script[src]'),
          ).find((el) => (el as HTMLScriptElement).src === normSrc)

          if (existingScript) {
            return
          }

          const script = document.createElement('script')

          for (const [key, value] of Object.entries(attrs)) {
            if (value !== undefined && value !== false) {
              script.setAttribute(
                key,
                typeof value === 'boolean' ? '' : String(value),
              )
            }
          }

          document.head.appendChild(script)
        } else if (typeof children === 'string') {
          const typeAttr =
            typeof attrs?.type === 'string' ? attrs.type : 'text/javascript'
          const nonceAttr =
            typeof attrs?.nonce === 'string' ? attrs.nonce : undefined
          const existingScript = Array.from(
            document.querySelectorAll('script:not([src])'),
          ).find((el) => {
            if (!(el instanceof HTMLScriptElement)) return false
            const sType = el.getAttribute('type') ?? 'text/javascript'
            const sNonce = el.getAttribute('nonce') ?? undefined
            return (
              el.textContent === children &&
              sType === typeAttr &&
              sNonce === nonceAttr
            )
          })

          if (existingScript) {
            return
          }

          const script = document.createElement('script')
          script.textContent = children

          if (attrs) {
            for (const [key, value] of Object.entries(attrs)) {
              if (value !== undefined && value !== false) {
                script.setAttribute(
                  key,
                  typeof value === 'boolean' ? '' : String(value),
                )
              }
            }
          }

          document.head.appendChild(script)
        }
      })
    }

    return () => {
      if (!(isServer ?? router.isServer)) {
        const { src: _src, ...rest } = props.attrs || {}
        return Vue.h('script', {
          ...rest,
          'data-allow-mismatch': true,
          innerHTML: '',
        })
      }

      if (props.attrs?.src && typeof props.attrs.src === 'string') {
        return Vue.h('script', props.attrs)
      }

      if (typeof props.children === 'string') {
        return Vue.h('script', {
          ...props.attrs,
          innerHTML: props.children,
        })
      }

      return null
    }
  },
})

export function Asset({ tag, attrs, children }: RouterManagedTag): any {
  switch (tag) {
    case 'title':
      return Vue.h(Title, { children: children })
    case 'meta':
      return <meta {...attrs} />
    case 'link':
      return <link {...attrs} />
    case 'style':
      return <style {...attrs} innerHTML={children} />
    case 'script':
      return Vue.h(Script, { attrs, children: children })
    default:
      return null
  }
}
