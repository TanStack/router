import type { AnyStartConfigOptions } from './createStart'

declare global {
  interface Window {
    __TSS_START_INSTANCE__?: AnyStartConfigOptions
  }
}

export {}
