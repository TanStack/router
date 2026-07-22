import { reconciler } from '@nativescript-community/react'

/** NativeScript renderer equivalent of `react-dom.flushSync`. */
export function flushSync<T>(callback: () => T): T {
  try {
    return callback()
  } finally {
    reconciler.flushSyncWork()
  }
}
