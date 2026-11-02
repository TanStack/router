import type * as React from 'react'

declare module '@tanstack/router-core/extensions' {
  export interface SerializerExtensions {
    ReadableStream: React.JSX.Element
  }
}
