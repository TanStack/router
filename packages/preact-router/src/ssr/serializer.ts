import type { VNode } from 'preact'

declare module '@tanstack/router-core' {
  export interface SerializerExtensions {
    ReadableStream: VNode
  }
}
