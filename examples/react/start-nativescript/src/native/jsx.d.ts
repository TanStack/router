import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      actionbar: Record<string, unknown>
      actionitem: Record<string, unknown>
      contentview: Record<string, unknown>
      frame: Record<string, unknown>
      gridlayout: Record<string, unknown>
      navigationbutton: Record<string, unknown>
      page: Record<string, unknown>
      scrollview: Record<string, unknown>
      stacklayout: Record<string, unknown>
    }
  }
}
