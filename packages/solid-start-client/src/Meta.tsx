import { HeadContent } from '@tanstack/solid-router'

export const Meta = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'The Meta component is deprecated. Use `HeadContent` from `@tanstack/solid-router` instead.',
    )
  }
  return <HeadContent />
}
