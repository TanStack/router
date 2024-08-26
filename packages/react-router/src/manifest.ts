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
      tag: 'meta' | 'link'
      attrs?: Record<string, any>
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
