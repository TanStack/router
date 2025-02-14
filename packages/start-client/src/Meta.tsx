import { HeadContent } from './HeadContent'

export const Meta = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn('The Meta component is deprecated. Use `HeadContent` instead.')
  }
  return <HeadContent />
}
