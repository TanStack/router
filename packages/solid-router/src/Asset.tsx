import { useHead } from '@unhead/solid-js'
import type { RouterManagedTag } from '@tanstack/router-core'
import type { JSX } from 'solid-js'
import type { UseHeadInput, ValidTagPositions } from 'unhead/types'

export function Asset(
  props: RouterManagedTag & {
    tagPosition?: ValidTagPositions
  },
): JSX.Element | null {
  useHead(toHeadInput(props))
  return null
}

function toHeadInput({
  tag,
  attrs,
  children,
  tagPosition,
}: RouterManagedTag & {
  tagPosition?: ValidTagPositions
}): UseHeadInput {
  const withPosition = (input: Record<string, any>) => {
    if (tagPosition) {
      input.tagPosition = tagPosition
    }
    return input
  }

  switch (tag) {
    case 'title':
      return { title: children }
    case 'meta': {
      return { meta: [withPosition({ ...(attrs ?? {}) })] }
    }
    case 'link': {
      return { link: [withPosition({ ...(attrs ?? {}) })] }
    }
    case 'style': {
      const style = withPosition({ ...(attrs ?? {}) })
      if (typeof children === 'string') {
        style.textContent = children
      }
      return { style: [style] }
    }
    case 'script': {
      const script = withPosition({ ...(attrs ?? {}) })
      if (typeof children === 'string') {
        script.textContent = children
      }
      return { script: [script] }
    }
    default:
      return {}
  }
}
