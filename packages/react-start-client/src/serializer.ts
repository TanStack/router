import type * as React from 'react'

declare module '@tanstack/start-client-core' {
  export interface SerializerExtensions {
    ReadableStream: React.JSX.Element
  }
}
