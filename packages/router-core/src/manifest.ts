import type { Link, Meta } from "zhead"

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
    attrs?: Meta
    children?: never
  }
  | {
    tag: 'link'
    attrs?: Link
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
