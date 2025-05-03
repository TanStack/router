import type { LinkWithoutEvents, Meta } from 'unhead/types'

export type Manifest = {
  routes: Record<
    string,
    {
      filePath?: string
      preloads?: Array<string>
      assets?: Array<RouterManagedTag>
    }
  >
}

export type RouterManagedTag =
  | {
      tag: 'title'
      attrs?: Record<string, any>
      children: string
    }
  | {
      tag: 'meta'
      attrs?:
        | (Record<string, any> &
            Omit<Meta, 'http-equiv' | 'charset' | 'content'> & {
              charSet?: Meta['charset']
              httpEquiv?: Meta['http-equiv']
            })
        | undefined
      children?: never
    }
  | {
      tag: 'link'
      attrs?: Record<string, any> & Omit<LinkWithoutEvents, 'referrerpolicy'>
      children?: never
    }
  | {
      tag: 'script'
      attrs?: Record<string, any>
      children?: string
    }
  | {
      tag: 'style'
      attrs?: Record<string, any>
      children?: string
    }
