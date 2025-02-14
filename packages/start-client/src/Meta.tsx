import { HeadContent } from '@tanstack/react-router'

export const Meta = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn(
      'The Meta component is deprecated. Use `HeadContent` from `@tanstack/react-router` instead.',
    )
  }
  return <HeadContent />
}
